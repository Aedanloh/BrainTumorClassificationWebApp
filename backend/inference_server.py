import os
import sys
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms
from PIL import Image
import numpy as np
import cv2

PORT = 5005
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "best_model.pth")
CLASSES_PATH = os.path.join(BASE_DIR, "models", "classes.txt")

# Load classes
if os.path.exists(CLASSES_PATH):
    with open(CLASSES_PATH, "r") as f:
        classes = [line.strip() for line in f.read().split("\n") if line.strip()]
else:
    classes = ["glioma", "meningioma", "notumor", "pituitary"]

# Setup device (prefer CUDA if available for maximum speed)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[Inference Server] Initializing on device: {device}")

# Load model into memory ONCE
model = models.resnet18(weights=None)
num_features = model.fc.in_features
model.fc = nn.Linear(num_features, len(classes))
model = model.to(device)

model_loaded = False
if os.path.exists(MODEL_PATH):
    try:
        model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
        model_loaded = True
        print(f"[Inference Server] Successfully loaded weights from {MODEL_PATH}")
    except Exception as e:
        print(f"[Inference Server] Failed to load model weights: {e}")
else:
    print(f"[Inference Server] Model file not found at {MODEL_PATH}")

model.eval()
target_layer = model.layer4[-1]

# Preprocessing pipeline
preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# Global hook buffers for Grad-CAM
features_blobs = []
gradients_blobs = []

def hook_feature(module, input, output):
    features_blobs.clear()
    features_blobs.append(output.data)

def hook_gradient(module, grad_input, grad_output):
    gradients_blobs.clear()
    gradients_blobs.append(grad_output[0].data)

def run_prediction_and_gradcam(image_path, output_heatmap_path):
    t_start = time.time()
    img_pil = Image.open(image_path).convert("RGB")
    input_tensor = preprocess(img_pil).unsqueeze(0).to(device)

    # Register hooks
    handle_forward = target_layer.register_forward_hook(hook_feature)
    handle_backward = target_layer.register_full_backward_hook(hook_gradient)

    output = model(input_tensor)
    probs = F.softmax(output, dim=1)
    conf, idx = torch.max(probs, 1)
    pred_idx = idx.item()
    pred_confidence = conf.item()

    model.zero_grad()
    score = output[0, pred_idx]
    score.backward()

    handle_forward.remove()
    handle_backward.remove()

    gradients = gradients_blobs[0]
    activations = features_blobs[0]

    weights = torch.mean(gradients, dim=(2, 3), keepdim=True)
    cam = torch.sum(weights * activations, dim=1, keepdim=True)
    cam = F.relu(cam)
    cam = cam.cpu().numpy()[0, 0]

    cam_min, cam_max = cam.min(), cam.max()
    if cam_max - cam_min > 1e-8:
        cam = (cam - cam_min) / (cam_max - cam_min)
    else:
        cam = np.zeros_like(cam)

    img = cv2.imread(image_path)
    if img is not None:
        h, w, _ = img.shape
        cam_resized = cv2.resize(cam, (w, h))
        heatmap = cv2.applyColorMap(np.uint8(255 * cam_resized), cv2.COLORMAP_JET)
        overlay = cv2.addWeighted(img, 0.6, heatmap, 0.4, 0)
        os.makedirs(os.path.dirname(output_heatmap_path), exist_ok=True)
        cv2.imwrite(output_heatmap_path, overlay)

    t_elapsed = time.time() - t_start
    print(f"[Inference Server] Analyzed {os.path.basename(image_path)} in {t_elapsed:.3f}s -> {classes[pred_idx]} ({pred_confidence*100:.1f}%)")

    return {
        "success": True,
        "prediction": classes[pred_idx],
        "confidence": pred_confidence,
        "probabilities": {classes[i]: probs[0].tolist()[i] for i in range(len(classes))},
        "heatmap_path": output_heatmap_path.replace("backend/", ""),
        "model_trained": model_loaded,
        "inference_time_sec": round(t_elapsed, 4)
    }

class InferenceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = json.dumps({"status": "ok", "device": str(device), "model_loaded": model_loaded})
            self.wfile.write(resp.encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/predict":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")
                data = json.loads(body)

                raw_filepath = data.get("raw_filepath")
                heatmap_filepath = data.get("heatmap_filepath")

                if not raw_filepath or not os.path.exists(raw_filepath):
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": f"Image file not found: {raw_filepath}"}).encode("utf-8"))
                    return

                result = run_prediction_and_gradcam(raw_filepath, heatmap_filepath)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Suppress noisy standard HTTP logs
        pass

def run_server():
    server = HTTPServer(("127.0.0.1", PORT), InferenceHandler)
    print(f"[Inference Server] High-speed warm inference server running on http://127.0.0.1:{PORT}")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    run_server()
