@echo off
title Kiosk 3D Viewer - Setup
color 0A
setlocal enabledelayedexpansion

echo.
echo  ============================================
echo   Kiosk 3D Viewer - Full Setup
echo  ============================================
echo.

:: ============================================
:: CHECK: Python
:: ============================================
echo  [..] Checking for Python...
python --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Python not found!
    echo.
    echo  Please install Node.js WITH Python option checked:
    echo  https://nodejs.org/en/download
    echo.
    pause
    exit /b 1
)
echo  [OK] Python found
echo.

:: ============================================
:: CHECK: Node.js / npm
:: ============================================
echo  [..] Checking for Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js not found!
    echo.
    echo  Please install Node.js from:
    echo  https://nodejs.org/en/download
    echo  Make sure to check "Install Python" during setup
    echo.
    pause
    exit /b 1
)
echo  [OK] Node.js found
echo.

:: ============================================
:: CHECK: curl
:: ============================================
echo  [..] Checking for curl...
curl --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] curl not found!
    echo  curl is built into Windows 10/11
    echo  Please update Windows or install curl manually
    echo.
    pause
    exit /b 1
)
echo  [OK] curl found
echo.

:: ============================================
:: STEP 1: Three.js Libraries
:: ============================================
echo  ============================================
echo   Step 1 of 4 - Downloading Three.js
echo  ============================================
echo.

mkdir libs\three\build 2>nul
mkdir libs\three\examples\jsm\controls 2>nul
mkdir libs\three\examples\jsm\loaders 2>nul
mkdir libs\three\examples\jsm\utils 2>nul
mkdir libs\three\examples\jsm\libs\draco 2>nul

echo  [..] Three.js core...
curl -s -o libs\three\build\three.module.js "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
echo  [OK] three.module.js

echo  [..] OrbitControls...
curl -s -o libs\three\examples\jsm\controls\OrbitControls.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js"
echo  [OK] OrbitControls.js

echo  [..] GLTFLoader...
curl -s -o libs\three\examples\jsm\loaders\GLTFLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
echo  [OK] GLTFLoader.js

echo  [..] DRACOLoader...
curl -s -o libs\three\examples\jsm\loaders\DRACOLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js"
echo  [OK] DRACOLoader.js

echo  [..] KTX2Loader...
curl -s -o libs\three\examples\jsm\loaders\KTX2Loader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js"
echo  [OK] KTX2Loader.js

echo  [..] OBJLoader...
curl -s -o libs\three\examples\jsm\loaders\OBJLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/OBJLoader.js"
echo  [OK] OBJLoader.js

echo  [..] FBXLoader...
curl -s -o libs\three\examples\jsm\loaders\FBXLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/FBXLoader.js"
echo  [OK] FBXLoader.js

echo  [..] BufferGeometryUtils...
curl -s -o libs\three\examples\jsm\utils\BufferGeometryUtils.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js"
echo  [OK] BufferGeometryUtils.js

echo  [..] SkeletonUtils...
curl -s -o libs\three\examples\jsm\utils\SkeletonUtils.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js"
echo  [OK] SkeletonUtils.js

echo  [..] Draco decoder files...
curl -s -o libs\three\examples\jsm\libs\draco\draco_decoder.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/draco_decoder.js"
curl -s -o libs\three\examples\jsm\libs\draco\draco_decoder.wasm "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/draco_decoder.wasm"
curl -s -o libs\three\examples\jsm\libs\draco\draco_wasm_wrapper.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/draco_wasm_wrapper.js"
echo  [OK] Draco files

echo.
echo  [OK] Three.js complete
echo.

:: ============================================
:: STEP 2: Ollama
:: ============================================
echo  ============================================
echo   Step 2 of 4 - Installing Ollama
echo  ============================================
echo.

ollama --version >nul 2>&1
if not errorlevel 1 (
    echo  [SKIP] Ollama already installed
) else (
    echo  [..] Downloading Ollama installer...
    curl -L -o ollama-setup.exe "https://ollama.com/download/OllamaSetup.exe"
    if errorlevel 1 (
        color 0C
        echo  [ERROR] Failed to download Ollama
        echo  Please install manually from https://ollama.com
        pause
        exit /b 1
    )
    echo  [..] Running Ollama installer...
    echo  [!!] Complete the Ollama installer, then come back here
    echo.
    start /wait ollama-setup.exe
    del ollama-setup.exe
    echo  [OK] Ollama installed
)

echo.
echo  [..] Starting Ollama service...
start /min cmd /c "ollama serve"
timeout /t 3 /nobreak >nul

echo  [..] Pulling AI model: leeplenty/ellaria:latest
echo  [!!] This may take a few minutes depending on your connection...
echo.
ollama pull leeplenty/ellaria:latest
if errorlevel 1 (
    color 0C
    echo  [ERROR] Failed to pull AI model
    echo  Make sure Ollama is running and try again
    pause
    exit /b 1
)
echo.
echo  [OK] Ollama and AI model ready
echo.

:: ============================================
:: STEP 3: Kokoro TTS
:: ============================================
echo  ============================================
echo   Step 3 of 4 - Installing Kokoro TTS
echo  ============================================
echo.

echo  [..] Installing kokoro-onnx Python package...
pip install kokoro-onnx >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Failed to install kokoro-onnx
    echo  Make sure Python is installed correctly
    pause
    exit /b 1
)
echo  [OK] kokoro-onnx installed

echo.
mkdir voices 2>nul

:: Check if voice files already exist
if exist "voices\kokoro-v1.0.onnx" (
    echo  [SKIP] kokoro-v1.0.onnx already exists
) else (
    echo  [..] Downloading kokoro-v1.0.onnx (~310MB, please wait)...
    curl -L --progress-bar -o voices\kokoro-v1.0.onnx "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
    if errorlevel 1 (
        color 0C
        echo  [ERROR] Failed to download kokoro-v1.0.onnx
        pause
        exit /b 1
    )
    echo  [OK] kokoro-v1.0.onnx downloaded
)

if exist "voices\voices-v1.0.bin" (
    echo  [SKIP] voices-v1.0.bin already exists
) else (
    echo  [..] Downloading voices-v1.0.bin (~180MB, please wait)...
    curl -L --progress-bar -o voices\voices-v1.0.bin "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
    if errorlevel 1 (
        color 0C
        echo  [ERROR] Failed to download voices-v1.0.bin
        pause
        exit /b 1
    )
    echo  [OK] voices-v1.0.bin downloaded
)

echo.
echo  [OK] Kokoro TTS ready
echo.

:: ============================================
:: STEP 4: Verify Everything
:: ============================================
echo  ============================================
echo   Step 4 of 4 - Verifying Installation
echo  ============================================
echo.

set ERRORS=0

call :checkfile "libs\three\build\three.module.js"
call :checkfile "libs\three\examples\jsm\controls\OrbitControls.js"
call :checkfile "libs\three\examples\jsm\loaders\GLTFLoader.js"
call :checkfile "libs\three\examples\jsm\loaders\DRACOLoader.js"
call :checkfile "libs\three\examples\jsm\utils\BufferGeometryUtils.js"
call :checkfile "libs\three\examples\jsm\libs\draco\draco_decoder.js"
call :checkfile "libs\three\examples\jsm\libs\draco\draco_decoder.wasm"
call :checkfile "libs\three\examples\jsm\libs\draco\draco_wasm_wrapper.js"
call :checkfile "voices\kokoro-v1.0.onnx"
call :checkfile "voices\voices-v1.0.bin"

echo.
if %ERRORS%==0 (
    color 0A
    echo  ============================================
    echo   Setup Complete!
    echo  ============================================
    echo.
    echo   Next steps:
    echo   1. Add your GLTF model to the /models folder
    echo   2. Double-click start.bat to launch
    echo   3. Open http://localhost:8080 in your browser
    echo.
) else (
    color 0C
    echo  ============================================
    echo   WARNING: %ERRORS% file(s) missing!
    echo   Check errors above and run setup.bat again
    echo  ============================================
)

echo.
pause
exit /b

:checkfile
if exist %1 (
    echo  [OK] %~1
) else (
    echo  [MISSING] %~1
    set /a ERRORS+=1
)
exit /b