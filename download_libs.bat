@echo off
title Downloading Three.js Libraries
color 0A

echo.
echo  ================================
echo   Downloading Three.js Libraries
echo  ================================
echo.

:: Create all folders
mkdir libs\three\build 2>nul
mkdir libs\three\examples\jsm\controls 2>nul
mkdir libs\three\examples\jsm\loaders 2>nul
mkdir libs\three\examples\jsm\utils 2>nul
mkdir libs\three\examples\jsm\libs\draco 2>nul

echo  [..] Downloading Three.js core...
curl -o libs\three\build\three.module.js "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
echo  [OK] three.module.js

echo.
echo  [..] Downloading Controls...
curl -o libs\three\examples\jsm\controls\OrbitControls.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js"
echo  [OK] OrbitControls.js

echo.
echo  [..] Downloading Loaders...
curl -o libs\three\examples\jsm\loaders\GLTFLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
echo  [OK] GLTFLoader.js

curl -o libs\three\examples\jsm\loaders\DRACOLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js"
echo  [OK] DRACOLoader.js

curl -o libs\three\examples\jsm\loaders\KTX2Loader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js"
echo  [OK] KTX2Loader.js

curl -o libs\three\examples\jsm\loaders\OBJLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/OBJLoader.js"
echo  [OK] OBJLoader.js

curl -o libs\three\examples\jsm\loaders\FBXLoader.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/FBXLoader.js"
echo  [OK] FBXLoader.js

echo.
echo  [..] Downloading Utils...
curl -o libs\three\examples\jsm\utils\BufferGeometryUtils.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js"
echo  [OK] BufferGeometryUtils.js

curl -o libs\three\examples\jsm\utils\SkeletonUtils.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js"
echo  [OK] SkeletonUtils.js

curl -o libs\three\examples\jsm\utils\MorphTargetUtils.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/MorphTargetUtils.js"
echo  [OK] MorphTargetUtils.js

echo.
echo  [..] Downloading Draco decoder files...
curl -o libs\three\examples\jsm\libs\draco\draco_decoder.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/draco_decoder.js"
echo  [OK] draco_decoder.js

curl -o libs\three\examples\jsm\libs\draco\draco_decoder.wasm "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/draco_decoder.wasm"
echo  [OK] draco_decoder.wasm

curl -o libs\three\examples\jsm\libs\draco\draco_wasm_wrapper.js "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/draco_wasm_wrapper.js"
echo  [OK] draco_wasm_wrapper.js

echo.
echo  ================================
echo   Verifying downloads...
echo  ================================
echo.

:: Check each file exists and is not empty
set ERRORS=0

call :checkfile "libs\three\build\three.module.js"
call :checkfile "libs\three\examples\jsm\controls\OrbitControls.js"
call :checkfile "libs\three\examples\jsm\loaders\GLTFLoader.js"
call :checkfile "libs\three\examples\jsm\loaders\DRACOLoader.js"
call :checkfile "libs\three\examples\jsm\utils\BufferGeometryUtils.js"
call :checkfile "libs\three\examples\jsm\utils\SkeletonUtils.js"
call :checkfile "libs\three\examples\jsm\libs\draco\draco_decoder.js"
call :checkfile "libs\three\examples\jsm\libs\draco\draco_decoder.wasm"
call :checkfile "libs\three\examples\jsm\libs\draco\draco_wasm_wrapper.js"

echo.
if %ERRORS%==0 (
    color 0A
    echo  ================================
    echo   All files downloaded OK!
    echo   You can now run start.bat
    echo  ================================
) else (
    color 0C
    echo  ================================
    echo   WARNING: %ERRORS% file(s) missing!
    echo   Check your internet connection
    echo   and run this file again
    echo  ================================
)

echo.
pause
exit /b

:: ---- helper function ----
:checkfile
if exist %1 (
    echo  [OK] %~1
) else (
    echo  [MISSING] %~1
    set /a ERRORS+=1
)
exit /b