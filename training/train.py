import os
import time
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models
import matplotlib.pyplot as plt
from tqdm import tqdm

def train_model(data_dir="dataset", num_epochs=10, batch_size=32, lr=0.0001, device=None):
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    # 1. Define data directories
    train_dir = os.path.join(data_dir, "Training")
    test_dir = os.path.join(data_dir, "Testing")
    
    if not os.path.exists(train_dir) or not os.path.exists(test_dir):
        raise FileNotFoundError(f"Ensure that '{train_dir}' and '{test_dir}' folders exist.")
        
    # 2. Define transforms
    train_transforms = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    test_transforms = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    # 3. Create datasets and dataloaders
    train_dataset = datasets.ImageFolder(train_dir, transform=train_transforms)
    test_dataset = datasets.ImageFolder(test_dir, transform=test_transforms)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0, pin_memory=True if torch.cuda.is_available() else False)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False, num_workers=0, pin_memory=True if torch.cuda.is_available() else False)
    
    class_names = train_dataset.classes
    num_classes = len(class_names)
    print(f"Detected classes: {class_names}")
    print(f"Training samples: {len(train_dataset)}, Testing samples: {len(test_dataset)}")
    
    # Save classes list to a text file for frontend/backend mapping
    os.makedirs("models", exist_ok=True)
    with open("models/classes.txt", "w") as f:
        f.write("\n".join(class_names))
    
    # 4. Initialize pretrained ResNet18 model
    print("Loading pretrained ResNet-18...")
    # Use newer weights parameter as pretrained=True is deprecated
    try:
        from torchvision.models import ResNet18_Weights
        model = models.resnet18(weights=ResNet18_Weights.DEFAULT)
    except ImportError:
        model = models.resnet18(pretrained=True)
        
    # Freeze convolutional layers (optional, but standard for feature extraction. 
    # For fine-tuning, we leave them trainable but use a small learning rate)
    num_features = model.fc.in_features
    model.fc = nn.Linear(num_features, num_classes)
    model = model.to(device)
    
    # 5. Loss & Optimizer
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)
    
    # 6. Training Loop
    history = {
        "train_loss": [], "train_acc": [],
        "val_loss": [], "val_acc": []
    }
    
    best_acc = 0.0
    start_time = time.time()
    
    for epoch in range(num_epochs):
        print(f"\nEpoch {epoch+1}/{num_epochs}")
        print("-" * 10)
        
        # Training Phase
        model.train()
        running_loss = 0.0
        running_corrects = 0
        
        for inputs, labels in tqdm(train_loader, desc="Training"):
            inputs = inputs.to(device)
            labels = labels.to(device)
            
            optimizer.zero_grad()
            
            outputs = model(inputs)
            _, preds = torch.max(outputs, 1)
            loss = criterion(outputs, labels)
            
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item() * inputs.size(0)
            running_corrects += torch.sum(preds == labels.data)
            
        epoch_train_loss = running_loss / len(train_dataset)
        epoch_train_acc = running_corrects.double().item() / len(train_dataset)
        
        # Validation Phase
        model.eval()
        running_val_loss = 0.0
        running_val_corrects = 0
        
        with torch.no_grad():
            for inputs, labels in tqdm(test_loader, desc="Validating"):
                inputs = inputs.to(device)
                labels = labels.to(device)
                
                outputs = model(inputs)
                _, preds = torch.max(outputs, 1)
                loss = criterion(outputs, labels)
                
                running_val_loss += loss.item() * inputs.size(0)
                running_val_corrects += torch.sum(preds == labels.data)
                
        epoch_val_loss = running_val_loss / len(test_dataset)
        epoch_val_acc = running_val_corrects.double().item() / len(test_dataset)
        
        print(f"Train Loss: {epoch_train_loss:.4f} Acc: {epoch_train_acc:.4f}")
        print(f"Val Loss: {epoch_val_loss:.4f} Acc: {epoch_val_acc:.4f}")
        
        # Save history
        history["train_loss"].append(epoch_train_loss)
        history["train_acc"].append(epoch_train_acc)
        history["val_loss"].append(epoch_val_loss)
        history["val_acc"].append(epoch_val_acc)
        
        # Save best model
        if epoch_val_acc > best_acc:
            best_acc = epoch_val_acc
            torch.save(model.state_dict(), "models/best_model.pth")
            print(f"New best model saved with Acc: {best_acc:.4f}")
            
    time_elapsed = time.time() - start_time
    print(f"\nTraining complete in {time_elapsed // 60:.0f}m {time_elapsed % 60:.0f}s")
    print(f"Best Val Acc: {best_acc:.4f}")
    
    # 7. Plot Loss and Accuracy curves
    plt.figure(figsize=(12, 4))
    
    plt.subplot(1, 2, 1)
    plt.plot(history["train_loss"], label="Train Loss")
    plt.plot(history["val_loss"], label="Val Loss")
    plt.title("Training and Validation Loss")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.legend()
    
    plt.subplot(1, 2, 2)
    plt.plot(history["train_acc"], label="Train Acc")
    plt.plot(history["val_acc"], label="Val Acc")
    plt.title("Training and Validation Accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy")
    plt.legend()
    
    plt.tight_layout()
    plt.savefig("models/training_curves.png")
    plt.close()
    print("Training curves saved to models/training_curves.png")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Train ResNet18 Brain Tumor Classifier")
    parser.add_argument("--data_dir", type=str, default="dataset", help="Path to dataset folder")
    parser.add_argument("--epochs", type=int, default=10, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=32, help="Batch size")
    parser.add_argument("--lr", type=float, default=0.0001, help="Learning rate")
    args = parser.parse_args()
    
    train_model(data_dir=args.data_dir, num_epochs=args.epochs, batch_size=args.batch_size, lr=args.lr)
