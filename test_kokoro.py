#!/usr/bin/env python3
"""
Kokoro TTS Standalone Test
Directly generates audio without needing kokoro_server.py
"""

import sys
import subprocess

# ==================================================
#  AUTO INSTALL PACKAGES
# ==================================================

REQUIRED_PACKAGES = [
    ('kokoro_onnx', 'kokoro-onnx'),
    ('soundfile',   'soundfile'),
    ('numpy',       'numpy'),
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

import os
import io
import re

# ==================================================
#  LOAD KOKORO MODEL
# ==================================================

print("=" * 40)
print(" Kokoro TTS Standalone Test")
print("=" * 40)

MODEL_PATH  = "./voice/kokoro-v1.0.onnx"
VOICES_PATH = "./voice/voices-v1.0.bin"

print("\n[1/2] Checking model files...")

if not os.path.exists(MODEL_PATH):
    print(f"      [ERROR] Model not found: {MODEL_PATH}")
    input("\nPress Enter to exit...")
    sys.exit(1)
else:
    size = os.path.getsize(MODEL_PATH) / (1024*1024)
    print(f"      [OK] Model found ({size:.1f} MB)")

if not os.path.exists(VOICES_PATH):
    print(f"      [ERROR] Voices not found: {VOICES_PATH}")
    input("\nPress Enter to exit...")
    sys.exit(1)
else:
    size = os.path.getsize(VOICES_PATH) / (1024*1024)
    print(f"      [OK] Voices found ({size:.1f} MB)")

print("\n[2/2] Loading Kokoro model...")
try:
    from kokoro_onnx import Kokoro
    import soundfile as sf

    kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
    print("      [OK] Model loaded!")

except ImportError as e:
    print(f"      [ERROR] Missing package: {e}")
    print("      Install with: pip install kokoro-onnx soundfile")
    input("\nPress Enter to exit...")
    sys.exit(1)

except Exception as e:
    print(f"      [ERROR] Failed to load model: {e}")
    import traceback
    traceback.print_exc()
    input("\nPress Enter to exit...")
    sys.exit(1)

# ==================================================
#  TEXT CLEANING
# ==================================================

EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F9FF"
    "\U00002702-\U000027B0"
    "]+",
    flags=re.UNICODE,
)

def clean_text(text):
    """Clean text before TTS"""
    text = EMOJI_PATTERN.sub("", text)
    text = re.sub(r'\*\*?(.*?)\*\*?', r'\1', text)
    text = re.sub(r'#{1,6}\s', '', text)
    text = re.sub(r'`', '', text)
    text = text.replace('&', 'and')
    text = text.replace('@', 'at')
    text = text.replace('#', '')
    text = text.replace('...', '.')
    text = text.replace('\u2019', "'")
    text = text.replace('\u2018', "'")
    text = text.replace('\u201c', '')
    text = text.replace('\u201d', '')
    text = ' '.join(text.split()).strip()
    return text

# ==================================================
#  GENERATE AUDIO
# ==================================================

def generate_audio(text, voice='af_sarah', speed=1.0):
    """Generate audio and return WAV bytes"""
    try:
        samples, sample_rate = kokoro.create(
            text,
            voice=voice,
            speed=speed,
            lang="en-us",
        )

        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format="WAV")
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print(f"      [ERROR] Generation failed: {e}")
        import traceback
        traceback.print_exc()
        return None

def save_audio(audio_bytes, filename):
    """Save audio bytes to file"""
    try:
        with open(filename, 'wb') as f:
            f.write(audio_bytes)
        return True
    except Exception as e:
        print(f"      [ERROR] Could not save file: {e}")
        return False

# ==================================================
#  AVAILABLE VOICES
# ==================================================

VOICES = {
    "female_american": [
        "af_sarah",
        "af_bella",
        "af_nicole",
        "af_sky",
    ],
    "female_british": [
        "bf_emma",
        "bf_isabella",
    ],
    "male_american": [
        "am_adam",
        "am_michael",
    ],
    "male_british": [
        "bm_george",
        "bm_lewis",
    ]
}

# ==================================================
#  INTERACTIVE LOOP
# ==================================================

def interactive_mode():
    current_voice = 'af_sarah'
    current_speed = 1.0
    counter = 0

    print("\n" + "="*60)
    print("  INTERACTIVE MODE")
    print("="*60)
    print("\nType text and press Enter to generate speech")
    print("\nCommands:")
    print("  voices           - List all voices")
    print("  voice <name>     - Change voice (e.g., 'voice af_bella')")
    print("  speed <number>   - Change speed (e.g., 'speed 1.2')")
    print("  test             - Run a test phrase")
    print("  quit             - Exit")
    print("="*60)
    print(f"\nCurrent voice: {current_voice}")
    print(f"Current speed: {current_speed}x")

    while True:
        try:
            user_input = input("\n> ").strip()

            if not user_input:
                continue

            # Quit
            if user_input.lower() in ('quit', 'exit', 'q'):
                break

            # List voices
            if user_input.lower() == 'voices':
                for category, voice_list in sorted(VOICES.items()):
                    print(f"\n{category.upper().replace('_', ' ')}:")
                    for v in voice_list:
                        marker = " <- current" if v == current_voice else ""
                        print(f"  {v}{marker}")
                continue

            # Change voice
            if user_input.lower().startswith('voice '):
                new_voice = user_input[6:].strip()
                if new_voice:
                    current_voice = new_voice
                    print(f"[OK] Voice: {current_voice}")
                continue

            # Change speed
            if user_input.lower().startswith('speed '):
                try:
                    new_speed = float(user_input[6:].strip())
                    if 0.5 <= new_speed <= 2.0:
                        current_speed = new_speed
                        print(f"[OK] Speed: {current_speed}x")
                    else:
                        print("[ERROR] Speed must be between 0.5 and 2.0")
                except ValueError:
                    print("[ERROR] Invalid speed value")
                continue

            # Test phrase
            if user_input.lower() == 'test':
                user_input = "Hello! This is a test of the Kokoro text to speech system."

            # Clean text
            cleaned = clean_text(user_input)
            if not cleaned:
                print("[ERROR] Text is empty after cleaning")
                continue

            # Generate audio
            print(f"[..] Generating audio...")
            audio = generate_audio(cleaned, current_voice, current_speed)

            if audio:
                counter += 1
                filename = f"test_output_{counter}.wav"
                if save_audio(audio, filename):
                    size_kb = len(audio) / 1024
                    print(f"[OK] Saved: {filename}")
                    print(f"     Size:  {size_kb:.1f} KB")
                    print(f"     Voice: {current_voice}")
                    print(f"     Speed: {current_speed}x")
            else:
                print("[FAIL] Could not generate audio")

        except KeyboardInterrupt:
            print("\n\nType 'quit' to exit")
        except EOFError:
            break
        except Exception as e:
            print(f"[ERROR] {e}")
            import traceback
            traceback.print_exc()

# ==================================================
#  MAIN
# ==================================================

if __name__ == '__main__':
    try:
        interactive_mode()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)

    print("\nDone!")
    input("\nPress Enter to exit...")