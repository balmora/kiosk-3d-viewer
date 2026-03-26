#!/usr/bin/env python3
"""
Luna AI Kiosk - Startup Script
Cross-platform alternative to start.bat
"""

import sys
import os
import time
import subprocess
import webbrowser
import socket
import requests
import json

def check_port(port, host='localhost'):
    """Check if a port is open and responding"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2)
            result = s.connect_ex((host, port))
            return result == 0
    except Exception:
        return False

def is_ollama_running():
    """Check if Ollama is responding on localhost:11434"""
    return check_port(11434)

def kill_process_by_name(name):
    """Kill processes by name (cross-platform)"""
    print(f"[..] Stopping existing {name} processes...")
    try:
        if sys.platform == 'win32':
            result = subprocess.run(['taskkill', '/f', '/im', name + '.exe'],
                                    capture_output=True, text=True)
        else:
            result = subprocess.run(['pkill', '-f', name],
                                    capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[OK] Stopped {name}")
        else:
            print(f"[..] No {name} processes were running")
    except Exception as e:
        print(f"[WARN] Could not kill {name}: {e}")

def check_python_package(package):
    """Check if a Python package is installed"""
    try:
        __import__(package.replace('-', '_'))
        return True
    except ImportError:
        return False

def get_character_name():
    """Get character name from character.json if it exists"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Try models/character.json first, then project root
    paths = [
        os.path.join(script_dir, 'models', 'character.json'),
        os.path.join(script_dir, 'character.json')
    ]
    
    for path in paths:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                    name = data.get('identity', {}).get('name')
                    if name:
                        print(f"[OK] Character name: {name}")
                        return name
            except Exception as e:
                print(f"[WARN] Could not read character.json: {e}")
    
    return None

def main():
    print("=" * 50)
    print("  Luna AI Kiosk - Starting")
    print("=" * 50)
    print()

    # Check Python dependencies
    print("[..] Checking Python dependencies...")
    missing = []
    if not check_python_package('flask'):
        missing.append('flask')
    if not check_python_package('flask_cors'):
        missing.append('flask-cors')
    if not check_python_package('kokoro_onnx'):
        missing.append('kokoro-onnx')
    if not check_python_package('soundfile'):
        missing.append('soundfile')
    if not check_python_package('requests'):
        missing.append('requests')

    if missing:
        print(f"[ERROR] Missing Python packages: {', '.join(missing)}")
        print("\nTo install, run:")
        print("  python setup.py")
        print("\nOr manually:")
        print("  pip install " + " ".join(missing))
        input("\nPress Enter to exit...")
        sys.exit(1)

    print("[OK] Python dependencies satisfied")
    print()

    # Check Ollama
    print("[..] Checking if Ollama is already running...")
    if is_ollama_running():
        print("[OK] Ollama already running on port 11434")
        ollama_started = False
        print()
    else:
        print("[..] Ollama not running, starting it...")
        kill_process_by_name('ollama')
        time.sleep(1)

        env = os.environ.copy()
        env['OLLAMA_ORIGINS'] = '*'

        try:
            if sys.platform == 'win32':
                proc = subprocess.Popen(['ollama', 'serve'],
                                        env=env,
                                        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                                        stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE)
            else:
                proc = subprocess.Popen(['ollama', 'serve'],
                                        env=env,
                                        start_new_session=True,
                                        stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE)

            print("[..] Waiting for Ollama to start (max 15 seconds)...")
            for i in range(15):
                if is_ollama_running():
                    print("[OK] Ollama started successfully")
                    print()
                    ollama_started = True
                    break
                time.sleep(1)
            else:
                print("[ERROR] Ollama failed to start within 15 seconds")
                if proc:
                    stdout, stderr = proc.communicate()
                    if stdout:
                        print("Ollama output:", stdout.decode())
                    if stderr:
                        print("Ollama errors:", stderr.decode())
                print("\nTroubleshooting:")
                print("  1. Make sure Ollama is installed: https://ollama.ai")
                print("  2. Try running 'ollama serve' manually in a terminal")
                print("  3. Check if another process is using port 11434")
                input("\nPress Enter to exit...")
                sys.exit(1)
        except FileNotFoundError:
            print("[ERROR] Ollama executable not found!")
            print("  Please install Ollama from https://ollama.ai")
            input("\nPress Enter to exit...")
            sys.exit(1)

    # Check Kokoro port
    print("[..] Checking Kokoro TTS server...")
    if check_port(8000):
        print("[OK] Kokoro already running on port 8000")
        print()
    else:
        print("[..] Starting Kokoro TTS server...")
        script_dir = os.path.dirname(os.path.abspath(__file__))
        kokoro_script = os.path.join(script_dir, 'kokoro_server.py')
        
        # Get character name for Kokoro test text
        character_name = get_character_name()
        
        try:
            # Set environment variable for character name
            env = os.environ.copy()
            if character_name:
                env['KIOSK_CHARACTER_NAME'] = character_name
            
            kokoro_proc = subprocess.Popen(
                [sys.executable, kokoro_script],
                cwd=script_dir,
                env=env,
                start_new_session=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            print("[..] Waiting for Kokoro to start (max 35 seconds)...")
            print("     (First run may take longer due to package installation)")

            for i in range(35):
                if check_port(8000):
                    print(f"[OK] Kokoro TTS started in {i+1} seconds")
                    print()
                    break
                time.sleep(1)
                # Show progress every 5 seconds
                if (i + 1) % 5 == 0:
                    print(f"     ...still waiting ({i+1}s)")
            else:
                print("[ERROR] Kokoro failed to start within 35 seconds")
                print("\n--- Kokoro Output ---")

                # Get any output from the process
                try:
                    stdout, stderr = kokoro_proc.communicate(timeout=2)
                    if stdout:
                        print("STDOUT:")
                        print(stdout.decode(errors='ignore'))
                    if stderr:
                        print("STDERR:")
                        print(stderr.decode(errors='ignore'))
                except:
                    print("Could not retrieve process output")

                print("\nTroubleshooting:")
                print("  1. Make sure Python packages are installed:")
                print("     pip install flask flask-cors kokoro-onnx soundfile requests")
                print("  2. Check that voice files exist:")
                print("     - voice/kokoro-v1.0.onnx")
                print("     - voice/voices-v1.0.bin")
                print("  3. Try running 'python kokoro_server.py' manually to see errors")
                print("  4. Check if port 8000 is already in use by another program")
                input("\nPress Enter to exit...")
                sys.exit(1)
        except Exception as e:
            print(f"[ERROR] Failed to start Kokoro: {e}")
            import traceback
            traceback.print_exc()
            input("\nPress Enter to exit...")
            sys.exit(1)

    # Start HTTP server
    print("[..] Starting web server...")
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Verify index.html exists in the expected directory
    index_path = os.path.join(script_dir, 'index.html')
    if not os.path.exists(index_path):
        print(f"[ERROR] index.html not found in {script_dir}")
        print("  Make sure you're running this from the project root directory")
        print("  and that index.html exists.")
        input("\nPress Enter to exit...")
        sys.exit(1)

    try:
        # Check if port 8080 is already in use
        if check_port(8080):
            print("[WARN] Port 8080 already in use - another instance may be running")

        # Start the server
        server_proc = subprocess.Popen([sys.executable, '-m', 'http.server', '8080'],
                         cwd=script_dir,
                         start_new_session=True,
                         stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE)
        time.sleep(2)

        # Verify server is actually serving content (not just port open)
        print("[..] Verifying server is serving content...")
        server_ready = False
        for attempt in range(5):
            try:
                resp = requests.get('http://localhost:8080', timeout=3)
                if resp.status_code == 200 and len(resp.content) > 100:
                    print(f"[OK] Web server ready - served {len(resp.content)} bytes")
                    server_ready = True
                    break
                else:
                    print(f"[..] Attempt {attempt+1}: status={resp.status_code}, content-length={len(resp.content)}")
            except requests.exceptions.RequestException as e:
                print(f"[..] Attempt {attempt+1} failed: {e}")
            time.sleep(1)

        if not server_ready:
            print("[ERROR] Web server started but not serving content properly")
            print("  This could mean:")
            print("  - index.html is missing or unreadable")
            print("  - The server is running from the wrong directory")
            print("  - Another service is interfering")
            print(f"\n  Expected index.html at: {index_path}")
            # Show server output if available
            try:
                stdout, stderr = server_proc.communicate(timeout=2)
                if stderr:
                    print("\nServer error output:")
                    print(stderr.decode(errors='ignore'))
            except:
                pass
            input("\nPress Enter to exit...")
            sys.exit(1)

        print()
    except Exception as e:
        print(f"[ERROR] Failed to start web server: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)

    # Open browser
    url = "http://localhost:8080"
    print(f"[..] Opening browser: {url}")
    try:
        webbrowser.open(url)
        print("[OK] Browser opened (or check your browser manually)")
        print()
    except Exception as e:
        print(f"[WARN] Could not open browser automatically: {e}")
        print(f"  Please open {url} manually")
        print()

    print("=" * 50)
    print("  All services are running!")
    print("=" * 50)
    print("  Services:")
    print("    Ollama : http://localhost:11434")
    print("    Kokoro : http://localhost:8000")
    print("    Viewer : http://localhost:8080")
    print("=" * 50)
    print()
    print("Press Ctrl+C to stop all services")
    print()

    # Keep script running until interrupted
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        print("[..] Stopping services...")
        kill_process_by_name('ollama')
        print("Goodbye!")
        sys.exit(0)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)
