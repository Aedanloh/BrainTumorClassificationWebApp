# Brain Tumor Classification & Explainable AI (Grad-CAM) Platform

This repository contains a web-based diagnostic support tool developed for classification of brain tumors from MRI scans, featuring model explainability using **Grad-CAM** (Gradient-weighted Class Activation Mapping). 

Developed as a Final Year Project (FYP) codebase.

## Features
- **Accurate Diagnostic Classification**: Classifies T1-weighted contrast-enhanced brain MRI scans into 4 categories:
  - Glioma
  - Meningioma
  - Pituitary Tumor
  - Normal (No Tumor)
- **Explainable AI (XAI)**: Generates a heat activation overlay (Grad-CAM) showing the exact diagnostic regions the deep network activated on to make its choice.
- **Side-by-Side Analysis Panel**: Interactive visualizer to inspect raw scan and Grad-CAM layers.
- **Session History Dashboard**: Local log of scans classified in the current session.
- **Tumor Encyclopedia**: Medical anatomy reference details for anatomical context.

---

## Technical Architecture

The platform uses a self-contained, high-performance integration bridge:
- **Frontend**: Single-page dashboard built using HTML5, modern Vanilla CSS (with HSL fluid layout), and standard JavaScript (fetch API, canvas rendering).
- **Backend**: PHP-based upload controller acting as a CLI runner process.
- **Deep Learning Model**: PyTorch implementation of a fine-tuned ResNet-18 CNN.

---

## Installation & Setup

### Prerequisites
- **PHP** (v7.4 or above)
- **Python** (v3.8 or above, v3.12 recommended)
- **CUDA-compatible GPU** (Optional, but highly recommended for fast training. The code automatically detects and utilizes GPU/CPU).

### 1. Set Up Python Dependencies
From the root directory, install the required deep learning and processing packages:
```bash
py -m pip install numpy matplotlib opencv-python Pillow tqdm
py -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

### 2. Prepare the Dataset
The platform assumes the MRI scans are placed in the `dataset` folder in the root, structured as follows:
```text
dataset/
├── Training/
│   ├── glioma/
│   ├── meningioma/
│   ├── notumor/
│   └── pituitary/
└── Testing/
    ├── glioma/
    ├── ...
```
If you already have the dataset folder, copy it to the root or create a directory link in Windows:
```powershell
New-Item -ItemType Junction -Path "dataset" -Value "C:\Path\To\Your\Dataset"
```

---

## Running the Project

### Step 1: Start the Web Server
Launch the PHP built-in web server from the project root directory:
```bash
php -S localhost:8000
```

### Step 2: Open the Application
Open your web browser and navigate to:
```text
http://localhost:8000/frontend/index.html
```

---

## Model Training & Evaluation

If you wish to train the deep CNN model on your custom dataset:

### 1. Run the Training Script
Run the script to train the model for a specified number of epochs (default is 10):
```bash
py training/train.py --epochs 10 --batch_size 32 --lr 0.0001
```
The script will:
- Check for CUDA acceleration (GPU) automatically.
- Load pre-trained ResNet-18 weights.
- Run train/val loss optimization.
- Save the highest-accuracy state weights to `models/best_model.pth`.
- Save training/loss curve graph plots to `models/training_curves.png`.

---

## Directory Structure
```text
FYP/
├── backend/
│   ├── upload.php           # Handles HTTP POST, saves files, executes predict.py
│   └── predict.py           # PyTorch loading, Grad-CAM processing, JSON response
├── dataset/                 # Symlink or folder containing T1 MRI scans
├── frontend/
│   ├── index.html           # Dashboard UI
│   ├── style.css            # Custom layout styles
│   └── app.js               # Network request & UI logic
├── models/
│   ├── classes.txt          # Class categories mapping
│   ├── best_model.pth       # Saved neural network weights
│   └── training_curves.png  # Training loss/accuracy plot
├── training/
│   └── train.py             # PyTorch training code
└── README.md
```
