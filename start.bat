@echo off
title Kiosk 3D Viewer
color 0A

echo.
echo  ================================
echo   Kiosk 3D Viewer - Full Start
echo  ================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Python is not installed!
    pause
    exit /b 1
)

:: Check Ollama
ollama --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0E
    echo  [WARNING] Ollama not found!
    echo  AI responses will use fallback mode
    echo  Install from https://ollama.com
    echo.
)

:: ✅ Start Ollama in background with CORS enabled
echo  [..] Starting Ollama AI...
set OLLAMA_ORIGINS=*
start /b ollama serve

:: Wait for Ollama to start
timeout /t 3 /nobreak >nul
echo  [OK] Ollama started

:: Start web server
echo  [..] Starting web server...
start /b python -m http.server 8080

:: Wait for web server
timeout /t 2 /nobreak >nul
echo  [OK] Web server started

:: Open browser
echo  [..] Opening browser...
start "" "http://localhost:8080"

echo.
echo  ================================
echo   Everything is running!
echo   Ollama : http://localhost:11434
echo   Viewer : http://localhost:8080
echo  ================================
echo.
echo  Close this window to stop everything
echo.

:: Keep window open
pause