<?php
// backend/auth.php
header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/db.php';
$db = get_db_connection();

$response = [
    'success' => false,
    'error' => ''
];

// Check request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $response['error'] = 'Only POST requests are allowed.';
    echo json_encode($response);
    exit;
}

// Get action parameter (can be in POST body or JSON format)
$action = isset($_POST['action']) ? $_POST['action'] : '';

// Handle JSON POST requests (e.g. from fetch with JSON body)
if (empty($action)) {
    $json_input = json_decode(file_get_contents('php://input'), true);
    if ($json_input && isset($json_input['action'])) {
        $action = $json_input['action'];
        $_POST = array_merge($_POST, $json_input); // Merge into POST array
    }
}

if (empty($action)) {
    $response['error'] = 'Action parameter is required.';
    echo json_encode($response);
    exit;
}

switch ($action) {
    case 'signup':
        $name = isset($_POST['name']) ? trim($_POST['name']) : '';
        $email = isset($_POST['email']) ? trim($_POST['email']) : '';
        $password = isset($_POST['password']) ? $_POST['password'] : '';
        
        if (empty($name) || empty($email) || empty($password)) {
            $response['error'] = 'All fields (name, email, password) are required.';
            echo json_encode($response);
            exit;
        }
        
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $response['error'] = 'Invalid email address format.';
            echo json_encode($response);
            exit;
        }
        
        if (strlen($password) < 6) {
            $response['error'] = 'Password must be at least 6 characters long.';
            echo json_encode($response);
            exit;
        }
        
        try {
            // Check if email already exists
            $stmt = $db->prepare("SELECT id FROM doctors WHERE email = :email");
            $stmt->execute([':email' => $email]);
            if ($stmt->fetch()) {
                $response['error'] = 'An account with this email already exists.';
                echo json_encode($response);
                exit;
            }
            
            // Hash password and insert
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $insert_stmt = $db->prepare("INSERT INTO doctors (name, email, password_hash) VALUES (:name, :email, :password_hash)");
            $insert_stmt->execute([
                ':name' => $name,
                ':email' => $email,
                ':password_hash' => $hash
            ]);
            
            // Set session details to log in immediately
            $new_id = $db->lastInsertId();
            $_SESSION['doctor_id'] = $new_id;
            $_SESSION['doctor_name'] = $name;
            $_SESSION['doctor_email'] = $email;
            
            $response['success'] = true;
            $response['name'] = $name;
            
        } catch (PDOException $e) {
            $response['error'] = 'Signup failed: ' . $e->getMessage();
        }
        break;
        
    case 'login':
        $email = isset($_POST['email']) ? trim($_POST['email']) : '';
        $password = isset($_POST['password']) ? $_POST['password'] : '';
        
        if (empty($email) || empty($password)) {
            $response['error'] = 'Email and password are required.';
            echo json_encode($response);
            exit;
        }
        
        try {
            // Retrieve doctor
            $stmt = $db->prepare("SELECT * FROM doctors WHERE email = :email");
            $stmt->execute([':email' => $email]);
            $doctor = $stmt->fetch();
            
            if ($doctor && password_verify($password, $doctor['password_hash'])) {
                // Set session details
                $_SESSION['doctor_id'] = $doctor['id'];
                $_SESSION['doctor_name'] = $doctor['name'];
                $_SESSION['doctor_email'] = $doctor['email'];
                
                $response['success'] = true;
                $response['name'] = $doctor['name'];
            } else {
                $response['error'] = 'Invalid email or password.';
            }
            
        } catch (PDOException $e) {
            $response['error'] = 'Login failed: ' . $e->getMessage();
        }
        break;
        
    case 'check_session':
        if (isset($_SESSION['doctor_id'])) {
            $response['success'] = true;
            $response['logged_in'] = true;
            $response['name'] = $_SESSION['doctor_name'];
            $response['email'] = $_SESSION['doctor_email'];
        } else {
            $response['success'] = true;
            $response['logged_in'] = false;
        }
        break;
        
    case 'logout':
        session_unset();
        session_destroy();
        $response['success'] = true;
        break;
        
    default:
        $response['error'] = 'Unknown action: ' . $action;
}

echo json_encode($response);
