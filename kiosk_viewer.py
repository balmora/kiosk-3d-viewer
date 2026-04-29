#!/usr/bin/env python3
"""
Standalone Kiosk Viewer - PySide6 WebEngine
Frameless fullscreen browser with bundled Chromium.
Exit: Ctrl+C in terminal
"""

import sys
import subprocess

# ==================================================
#  AUTO INSTALL PACKAGES
# ==================================================

REQUIRED_PACKAGES = [
    ('PySide6', 'PySide6'),
    ('PySide6.QtCore', 'PySide6-Addons'),
]

print("Checking required packages...")
for import_name, pip_name in REQUIRED_PACKAGES:
    try:
        __import__(import_name)
    except ImportError:
        print(f"  [..] Installing {pip_name}...")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pip_name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"  [OK] {pip_name} installed")
        except subprocess.CalledProcessError:
            print(f"  [ERROR] Failed to install {pip_name}")
            print(f"          Try manually: pip install {pip_name}")
            input("\nPress Enter to exit...")
            sys.exit(1)

print("All packages ready!\n")

import time
import socket
import os
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile
from PySide6.QtCore import QUrl, QTimer, Qt
from PySide6.QtGui import QCursor


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


class KioskWindow(QMainWindow):
    def __init__(self, url, app):
        super().__init__()

        self.url = url
        self.app = app
        self.cursor_hidden = False
        self.last_mouse_pos = None
        self.activity_timer = QTimer(self)
        self.activity_timer.timeout.connect(self._check_mouse_activity)
        self.activity_timer.start(100)  # Check every 100ms

        self.touchscreen_mode = self._detect_touchscreen()

        # Create web view
        self.web_view = QWebEngineView(self)
        self.setCentralWidget(self.web_view)

        # Configure web settings
        self._configure_web_settings()

        # Set window flags for frameless fullscreen
        self._setup_window_flags()

        # Load the URL
        self.web_view.loadFinished.connect(self._on_load_finished)
        self.web_view.loadStarted.connect(self._on_load_started)
        self.web_view.page().javaScriptConsoleMessage = self._js_console_message
        self.web_view.load(QUrl(url))

        # Start hide timer
        self._reset_cursor_timer()

        print(f"[OK] Touchscreen mode: {'enabled' if self.touchscreen_mode else 'disabled'}")

    def _detect_touchscreen(self):
        """Detect if a touchscreen is available."""
        try:
            from PySide6.QtGui import QInputDevice, QPointingDevice
            for device in QInputDevice.devices():
                if device.type() == QInputDevice.DeviceType.TouchScreen:
                    return True
        except Exception:
            pass
        return False

    def _configure_web_settings(self):
        """Configure web engine settings."""
        settings = self.web_view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanPaste, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.ShowScrollBars, False)

    def _setup_window_flags(self):
        """Set window to frameless fullscreen."""
        # Frameless window (no title bar, no borders)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)

        # Hide cursor initially if touchscreen
        if self.touchscreen_mode:
            QApplication.setOverrideCursor(Qt.BlankCursor)

        self.showFullScreen()

    def _check_mouse_activity(self):
        """Poll mouse position to detect movement."""
        if self.touchscreen_mode:
            return

        current_pos = QCursor.pos()
        if self.last_mouse_pos is None:
            self.last_mouse_pos = current_pos
            return

        if current_pos != self.last_mouse_pos:
            # Mouse moved
            self.last_mouse_pos = current_pos
            if self.cursor_hidden:
                QApplication.restoreOverrideCursor()
                self.cursor_hidden = False
            self._reset_cursor_timer()

    def _reset_cursor_timer(self):
        """Reset the cursor hide timer."""
        if not self.touchscreen_mode:
            # Stop existing timer and start fresh
            self.activity_timer.stop()
            QTimer.singleShot(5000, self._hide_cursor)
            self.activity_timer.start(100)

    def _hide_cursor(self):
        """Hide the cursor after inactivity."""
        if not self.touchscreen_mode and not self.cursor_hidden:
            QApplication.setOverrideCursor(Qt.BlankCursor)
            self.cursor_hidden = True

    def _on_load_started(self):
        """Called when page starts loading."""
        print("[INFO] Page loading started...")

    def _on_load_finished(self, ok):
        """Called when page finishes loading."""
        if ok:
            print("[INFO] Page loaded successfully")
        else:
            print("[ERROR] Page failed to load")

    def _js_console_message(self, level, message, line, source):
        """Capture JavaScript console messages."""
        level_str = {0: "INFO", 1: "WARNING", 2: "ERROR"}.get(level, f"L{level}")
        if level >= 2:  # Only print errors and warnings
            print(f"[JS {level_str}] {message} (line {line})")


def main():
    print("=" * 50)
    print("  Standalone Kiosk Viewer")
    print("=" * 50)
    print()

    # Start memory server if not running
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if not check_port(8090):
        memory_script = os.path.join(script_dir, 'memory_server.py')
        if os.path.exists(memory_script):
            print("[..] Starting memory server...")
            try:
                subprocess.Popen(
                    [sys.executable, memory_script],
                    cwd=script_dir,
                    start_new_session=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                print("[OK] Memory server started")
            except Exception as e:
                print(f"[WARN] Could not start memory server: {e}")
        else:
            print("[WARN] memory_server.py not found - memory will not persist")
        print()

    target_url = "http://localhost:8080"

    if not wait_for_server(target_url, max_seconds=60, check_port_number=8080):
        msg = (
            f"Could not reach {target_url}.\n\n"
            "Make sure the web server is running first.\n"
            "Try running 'python start.py' or start the server manually."
        )
        print(msg)
        input("\nPress Enter to exit...")
        sys.exit(1)

    print("[OK] Launching kiosk viewer...")
    print()

    try:
        app = QApplication([])

        window = KioskWindow(target_url, app)

        def on_closed():
            print("[INFO] Viewer window closed")

        window.destroyed.connect(on_closed)

        # Run event loop - will exit on Ctrl+C
        app.exec()

    except KeyboardInterrupt:
        print("\n[INFO] Interrupted by user")
        sys.exit(0)

    except Exception as e:
        print(f"[ERROR] Failed to start web view: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)

    print("[INFO] Viewer exited")


if __name__ == '__main__':
    main()
