@echo off
title Zonos TTS Server
color 0A

echo.
echo  ================================
echo   Starting Zonos TTS Server
echo  ================================
echo.

:: ✅ Path to Zonos outside project
set ZONOS_PATH=c:\Apps\Zonos

:: Check Zonos exists
if not exist "%ZONOS_PATH%" (
    color 0C
    echo  [ERROR] Zonos not found at %ZONOS_PATH%
    echo  Please install Zonos first
    echo  cd %USERPROFILE%
    echo  git clone https://github.com/Zyphra/Zonos.git
    echo.
    pause
    exit /b 1
)

echo  [OK] Zonos found at %ZONOS_PATH%

:: ✅ Activate Zonos venv
call "%ZONOS_PATH%\venv\Scripts\activate"

echo  [..] Starting TTS server on port 8000...
echo.
echo  Health check: http://localhost:8000/health
echo  Press Ctrl+C to stop
echo.

:: ✅ Run server from project folder
python zonos_server.py

pause