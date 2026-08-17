<?php
header('Content-Type: application/json');

// Enable error reporting for debugging, but we will catch errors and format as JSON
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Set directory paths
$base_dir = dirname(__DIR__);
$upload_dir = $base_dir . '/backend/uploads';

// Ensure uploads folder exists
if (!file_exists($upload_dir)) {
    mkdir($upload_dir, 0777, true);
}

// Response structure
$response = [
    'success' => false,
    'error' => ''
];

$raw_filepath = '';
$raw_filename = '';

// Check if it's a sample scan request or file upload
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['sample_path'])) {
    // Handle Sample Scan selection
    $sample_rel_path = $_POST['sample_path']; // e.g. "dataset/Testing/glioma/Te-gl_0010.jpg"
    $sample_abs_path = $base_dir . '/' . $sample_rel_path;
    
    if (!file_exists($sample_abs_path)) {
        $response['error'] = 'Sample image file not found. Ensure dataset link is correct.';
        echo json_encode($response);
        exit;
    }
    
    // Copy the sample image to uploads so we can serve it as the raw image
    $extension = pathinfo($sample_abs_path, PATHINFO_EXTENSION);
    $file_id = uniqid('mri_sample_', true);
    $raw_filename = $file_id . '.' . $extension;
    $raw_filepath = $upload_dir . '/' . $raw_filename;
    
    if (!copy($sample_abs_path, $raw_filepath)) {
        $response['error'] = 'Failed to copy sample scan to uploads directory.';
        echo json_encode($response);
        exit;
    }
} else {
    // Handle normal file upload
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        $response['error'] = 'Only POST requests are allowed.';
        echo json_encode($response);
        exit;
    }

    if (!isset($_FILES['mri_image'])) {
        $response['error'] = 'No image file uploaded. Make sure the file input name is "mri_image".';
        echo json_encode($response);
        exit;
    }

    $file = $_FILES['mri_image'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        $response['error'] = 'File upload failed with error code: ' . $file['error'];
        echo json_encode($response);
        exit;
    }

    // Validate file type
    $allowed_types = ['image/jpeg', 'image/png', 'image/jpg'];
    $file_info = getimagesize($file['tmp_name']);

    if ($file_info === false || !in_array($file_info['mime'], $allowed_types)) {
        $response['error'] = 'Invalid file type. Only JPEG and PNG images are allowed.';
        echo json_encode($response);
        exit;
    }

    // Generate unique filenames
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    if (empty($extension)) {
        $extension = ($file_info['mime'] === 'image/png') ? 'png' : 'jpg';
    }
    $file_id = uniqid('mri_', true);
    $raw_filename = $file_id . '.' . $extension;
    $raw_filepath = $upload_dir . '/' . $raw_filename;

    // Move uploaded file
    if (!move_uploaded_file($file['tmp_name'], $raw_filepath)) {
        $response['error'] = 'Failed to save the uploaded image.';
        echo json_encode($response);
        exit;
    }
}

// Prepare file names for Grad-CAM
$heatmap_filename = 'heatmap_' . basename($raw_filepath);
$heatmap_filepath = $upload_dir . '/' . $heatmap_filename;

// Prepare commands for running python model script
$py_script = escapeshellarg($base_dir . '/backend/predict.py');
$arg_raw_img = escapeshellarg($raw_filepath);
$arg_heatmap = escapeshellarg($heatmap_filepath);
$model_path = escapeshellarg($base_dir . '/models/best_model.pth');

$command = "py $py_script $arg_raw_img $arg_heatmap $model_path 2>&1";

// Execute command
$output = shell_exec($command);

// Logging if output is empty
if ($output === null) {
    $response['error'] = 'Failed to execute Python prediction process.';
    echo json_encode($response);
    exit;
}

// Try to parse the python JSON output
$json_output = json_decode($output, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    // If output is not valid JSON, we have a python traceback or standard output crash
    $response['error'] = 'Python process failed. Output: ' . trim($output);
    echo json_encode($response);
    exit;
}

// Check if Python returned an error
if (isset($json_output['error'])) {
    $response['error'] = $json_output['error'];
    echo json_encode($response);
    exit;
}

// Build final successful response
$response['success'] = true;
$response['prediction'] = $json_output['prediction'];
$response['confidence'] = $json_output['confidence'];
$response['probabilities'] = $json_output['probabilities'];
$response['model_trained'] = $json_output['model_trained'];
$response['raw_image_url'] = 'backend/uploads/' . $raw_filename;
$response['heatmap_image_url'] = 'backend/uploads/' . $heatmap_filename;

if (isset($json_output['warning'])) {
    $response['warning'] = $json_output['warning'];
}

echo json_encode($response);
