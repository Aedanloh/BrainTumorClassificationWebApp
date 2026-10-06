@echo off
title NeuroClassify Platform
echo ========================================================
echo Starting NeuroClassify Brain Tumor Classification System
echo ========================================================
echo [1/2] Launching Fast In-Memory AI Inference Daemon...
start "NeuroClassify AI Engine" /min "C:\Users\Aedan Loh\AppData\Local\Programs\Python\Python312\python.exe" backend\inference_server.py

echo [2/2] Launching Web Server on localhost:8000...
start "NeuroClassify Web Server" /min "C:\xampp\php\php.exe" -S localhost:8000

timeout /t 2 /nobreak >nul
echo.
echo Opening browser: http://localhost:8000/frontend/index.html
start http://localhost:8000/frontend/index.html
echo.
echo NeuroClassify is active. Press any key to stop all servers.
pause >nul

echo Stopping servers...
taskkill /f /im php.exe >nul 2>&1
echo Done.
