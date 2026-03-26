#!/usr/bin/env python3
"""
WebKit window to display http://localhost:8080
Runs as a lightweight app window; intended to replace manual browser opening.
Designed to host a THREE.js scene later.
"""

import sys
import subprocess

# ==================================================
#  AUTO INSTALL PACKAGES
# ==================================================

# Auto-install required packages
required_packages = ['pywebview']
for package in required_packages:
    try:
        __import__('webview')  # pywebview imports as 'webview'
    except ImportError:
        print(f"{package} not found. Installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        print(f"{package} installed successfully!\n")

import time
import socket
import webview

def check_port(port, host='localhost', timeout=2):
    """Check if a port is accepting connections."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False

def wait_for_server(url, max_seconds=60, check_port_number=8080):
    """Wait for the target server to be reachable before trying to load."""
    print(f"[..] Waiting for {url} (max {max_seconds}s)...")
    for i in range(max_seconds):
        if check_port(check_port_number):
            print(f"[OK] Server ready in {i+1}s")
            return True
        time.sleep(1)
        if (i + 1) % 5 == 0:
            print(f"     ...still waiting ({i+1}s)")
    print(f"[ERROR] {url} did not become available within {max_seconds}s")
    return False

def on_closed():
    print("[INFO] Viewer window closed")

def main():
    print("=" * 50)
    print("  AI Viewer")
    print("=" * 50)
    print()

    target_url = "http://localhost:8080"
    
    if not wait_for_server(target_url, max_seconds=60, check_port_number=8080):
        msg = (
            f"Could not reach {target_url}.\n\n"
            "Make sure your startup pipeline started the web server first.\n"
            "Try running 'python start.py' and then this script, or ensure port 8080 is free."
        )
        print(msg)
        input("\nPress Enter to exit...")
        sys.exit(1)

    print("[OK] Launching web view...")
    print()
    
    try:
        window = webview.create_window(
            "AI Viewer",
            target_url,
            width=1200,
            height=800,
            resizable=True,
            background_color='#0b0f1a'
        )
        window.events.closed += on_closed

        webview.start(debug=False)  # Set debug=True for development
        
    except Exception as e:
        print(f"[ERROR] Failed to start web view: {e}")
        import traceback
        traceback.print_exc()
        
        print("\nTroubleshooting:")
        print("  1. On Linux, you may need: sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.0")
        print("  2. On Windows, pywebview uses Edge WebView2 (built into Windows 10/11)")
        print("  3. On macOS, pywebview uses native WebKit")
        
        input("\nPress Enter to exit...")
        sys.exit(1)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted.")
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERROR] {e}")
        time.sleep(10)
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)