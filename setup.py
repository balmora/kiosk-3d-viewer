#!/usr/bin/env python3
"""
Luna AI Kiosk - Setup Script
Cross-platform alternative to setup.bat
"""

import sys
import os
import urllib.request
import subprocess
import shutil
from pathlib import Path

def download_file(url, dest, description=""):
    """Download a file with progress"""
    print(f"[..] Downloading {dest.name} {description}...")
    try:
        with urllib.request.urlopen(url) as response, open(dest, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        print(f"[OK] {dest.name} downloaded")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to download {dest.name}: {e}")
        return False

def ensure_dir(path):
    """Create directory if it doesn't exist"""
    Path(path).mkdir(parents=True, exist_ok=True)

def install_package(package):
    """Install a Python package using pip"""
    print(f"[..] Installing {package}...")
    try:
        subprocess.run([sys.executable, '-m', 'pip', 'install', package],
                       stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL,
                       check=True)
        print(f"[OK] {package} installed")
        return True
    except subprocess.CalledProcessError:
        print(f"[ERROR] Failed to install {package}")
        return False

def main():
    print("=" * 50)
    print("  Luna AI Kiosk - Setup")
    print("=" * 50)
    print()

    script_dir = Path(__file__).parent.resolve()
    libs_dir = script_dir / 'libs'
    voice_dir = script_dir / 'voice'
    models_dir = script_dir / 'models'

    # Create directories
    print("[..] Creating directories...")
    ensure_dir(libs_dir / 'three' / 'build')
    ensure_dir(libs_dir / 'three' / 'examples' / 'jsm')
    ensure_dir(voice_dir)
    ensure_dir(models_dir)
    print("[OK] Directories created")

    # Download Three.js
    print("\n--- Three.js Libraries ---")
    three_version = 'v0.160.0'
    three_main = libs_dir / 'three' / 'build' / 'three.module.js'
    three_addons = libs_dir / 'three' / 'examples' / 'jsm' / 'index.js'

    if not three_main.exists():
        url = f"https://unpkg.com/three@{three_version}/build/three.module.js"
        if not download_file(url, three_main, f"(Three.js {three_version})"):
            print("[..] Trying alternative source...")
            url = f"https://cdn.jsdelivr.net/npm/three@{three_version}/build/three.module.js"
            download_file(url, three_main)
    else:
        print("[SKIP] three.module.js already exists")

    if not three_addons.exists():
        url = f"https://unpkg.com/three@{three_version}/examples/jsm/index.js"
        download_file(url, three_addons)
    else:
        print("[SKIP] three addons index.js already exists")

    # Download Kokoro ONNX model
    print("\n--- Kokoro TTS Models ---")
    model_file = voice_dir / 'kokoro-v1.0.onnx'
    voices_file = voice_dir / 'voices-v1.0.bin'

    if not model_file.exists():
        url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
        download_file(url, model_file, "(~310MB)")
    else:
        print("[SKIP] kokoro-v1.0.onnx already exists")

    if not voices_file.exists():
        url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
        download_file(url, voices_file, "(~180MB)")
    else:
        print("[SKIP] voices-v1.0.bin already exists")

    # Install Python dependencies
    print("\n--- Python Dependencies ---")
    install_package('flask')
    install_package('flask-cors')
    install_package('soundfile')
    install_package('requests')
    install_package('kokoro-onnx==0.3.3')  # pin to known version

    print()
    print("=" * 50)
    print("  Setup complete!")
    print("  Next: add your .gltf model to /models folder")
    print("  Then run: python start.py")
    print("=" * 50)
    print()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nSetup interrupted.")
        sys.exit(1)
