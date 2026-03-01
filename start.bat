@echo off
title Luna AI Kiosk
color 0A

echo.
echo  ================================
echo   Luna AI Kiosk - Full Start
echo  ================================
echo.

:: ✅ Kill existing processes
echo  [..] Stopping existing services...
taskkill /f /im ollama.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: ✅ Start Ollama
echo  [..] Starting Ollama...
set OLLAMA_ORIGINS=*
start "Ollama" cmd /k "set OLLAMA_ORIGINS=* && ollama serve"
timeout /t 3 /nobreak >nul
echo  [OK] Ollama started

:: ✅ Start Zonos TTS
echo  [..] Starting Zonos TTS...
start "Zonos TTS" cmd /k "C:\Apps\Zonos\venv\Scripts\activate && cd /d "C:\Users\Administrator\Desktop\Luna v0.01" && python zonos_server.py"
timeout /t 8 /nobreak >nul
echo  [OK] Zonos TTS started

:: ✅ Start web server
echo  [..] Starting web server...
start /b python -m http.server 8080
timeout /t 2 /nobreak >nul
echo  [OK] Web server started

:: ✅ Open browser
start "" "http://localhost:8080"

echo.
echo  ================================
echo   All services running!
echo   Ollama  : http://localhost:11434
echo   Zonos   : http://localhost:8000
echo   Viewer  : http://localhost:8080
echo  ================================
echo.
pause