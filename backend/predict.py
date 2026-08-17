import os
import sys
import json
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms
from PIL import Image
import numpy as np
import cv2

# Global variables to store activations and gradients for Grad-CAM
features_blobs = []
gradients_blobs = []

def hook_feature(module, input, output):
    features_blobs.clear()
    features_blobs.append(output.data)

def hook_gradient(module, grad_input, grad_output):
    gradients_blobs.clear()
    gradients_blobs.append(grad_output[0].data)

def generate_gradcam(model, input_tensor, original_img_path, output_path, target_layer):
    # Register hooks
    handle_forward = target_layer.register_forward_hook(hook_feature)
    handle_backward = target_layer.register_full_backward_hook(hook_gradient)
    
    # Forward pass
    output = model(input_tensor)
    
    # Get top class prediction index
    probs = F.softmax(output, dim=1)
    conf, idx = torch.max(probs, 1)
    pred_idx = idx.item()
    pred_confidence = conf.item()
    
    # Backward pass for gradients
    model.zero_grad()
    score = output[0, pred_idx]
    score.backward()
    
    # Remove hooks
    handle_forward.remove()
    handle_backward.remove()
    
    # Fetch activations and gradients
    gradients = gradients_blobs[0]
    activations = features_blobs[0]
    
    # Compute channel weights (global average pooling of gradients)
    weights = torch.mean(gradients, dim=(2, 3), keepdim=True)
    
    # Compute weighted sum of activations
    cam = torch.sum(weights * activations, dim=1, keepdim=True)
    
    # Apply ReLU
    cam = F.relu(cam)
    
    # Normalize to [0, 1]
    cam = cam.cpu().numpy()[0, 0]
    cam_min, cam_max = cam.min(), cam.max()
    if cam_max - cam_min > 1e-8:
        cam = (cam - cam_min) / (cam_max - cam_min)
    else:
        cam = np.zeros_like(cam)
        
    # Read original image
    img = cv2.imread(original_img_path)
    if img is None:
        raise ValueError(f"Could not load image at {original_img_path}")
        
    h, w, _ = img.shape
    
    # Resize cam to match original image size
    cam_resized = cv2.resize(cam, (w, h))
    
    # Convert CAM to RGB heatmap
    heatmap = cv2.applyColorMap(np.uint8(255 * cam_resized), cv2.COLORMAP_JET)
    
    # Overlay heatmap on original image
    # Note: cv2 opens images in BGR format
    overlay = cv2.addWeighted(img, 0.6, heatmap, 0.4, 0)
    
    # Save the output image
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, overlay)
    
    return pred_idx, pred_confidence, probs[0].tolist()

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided."}))
        sys.exit(1)
        
    image_path = sys.argv[1]
    
    # Setup paths
    output_heatmap_path = sys.argv[2] if len(sys.argv) > 2 else "backend/uploads/heatmap.jpg"
    model_path = sys.argv[3] if len(sys.argv) > 3 else "models/best_model.pth"
    classes_path = "models/classes.txt"
    
    # Check classes mapping
    if os.path.exists(classes_path):
        with open(classes_path, "r") as f:
            classes = [line.strip() for line in f.read().split("\n") if line.strip()]
    else:
        # Default Kaggle Brain Tumor classes
        classes = ["glioma", "meningioma", "notumor", "pituitary"]
        
    # Set device (CPU for inference is fast enough and reliable for CLI call)
    device = torch.device("cpu")
    
    # Initialize model skeleton
    try:
        from torchvision.models import ResNet18_Weights
        model = models.resnet18(weights=ResNet18_Weights.DEFAULT)
    except ImportError:
        model = models.resnet18(pretrained=True)
        
    num_features = model.fc.in_features
    model.fc = nn.Linear(num_features, len(classes))
    model = model.to(device)
    
    model_loaded = False
    warning_msg = ""
    
    # Try to load custom weights
    if os.path.exists(model_path):
        try:
            model.load_state_dict(torch.load(model_path, map_location=device))
            model_loaded = True
        except Exception as e:
            warning_msg = f"Failed to load weights: {str(e)}. Running with pre-trained initialization."
    else:
        warning_msg = f"Weights file '{model_path}' not found. Model has NOT been trained yet. Running with default ImageNet initialized weights."
        
    model.eval()
    
    # Target layer for Grad-CAM in ResNet18 is the last convolutional layer (layer4[-1])
    target_layer = model.layer4[-1]
    
    # Preprocess image
    try:
        img_pil = Image.open(image_path).convert("RGB")
    except Exception as e:
        print(json.dumps({"error": f"Error opening image: {str(e)}"}))
        sys.exit(1)
        
    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    input_tensor = preprocess(img_pil).unsqueeze(0) # add batch dimension
    
    # Generate prediction and heatmap
    try:
        pred_idx, confidence, probabilities = generate_gradcam(
            model, input_tensor, image_path, output_heatmap_path, target_layer
        )
        
        # Build response dict
        response = {
            "success": True,
            "prediction": classes[pred_idx],
            "confidence": confidence,
            "probabilities": {classes[i]: probabilities[i] for i in range(len(classes))},
            "heatmap_path": output_heatmap_path.replace("backend/", ""), # strip backend/ prefix for frontend access
            "model_trained": model_loaded
        }
        if warning_msg:
            response["warning"] = warning_msg
            
        print(json.dumps(response))
        
    except Exception as e:
        print(json.dumps({"error": f"Error during prediction: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
