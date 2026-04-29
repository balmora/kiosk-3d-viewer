#!/usr/bin/env python3
"""
GPT-SoVITS + Ollama TTS Test
Tests voice quality and responsiveness of GPT-SoVITS TTS pipeline.
Auto-installs GPT-SoVITS if not present.
"""

import sys
import subprocess

# ==================================================
#  AUTO INSTALL PACKAGES
# ==================================================

REQUIRED_PACKAGES = [
    ('requests', 'requests'),
    ('sounddevice', 'sounddevice'),
    ('soundfile', 'soundfile'),
    ('numpy', 'numpy'),
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
import re
import time
import io
import json
import requests
import numpy as np
import soundfile as sf
import sounddevice as sd


# ==================================================
#  CONFIGURATION
# ==================================================

OLLAMA_URL = 'http://localhost:11434/api/chat'
OLLAMA_MODEL = 'reefer/erplegend'

GPT_SOVITS_API = 'http://localhost:9880'
GPT_SOVITS_TEXT_LANG = 'en'
GPT_SOVITS_PROMPT_LANG = 'en'

GPT_SOVITS_DIR = 'gptsovits'
GPT_SOVITS_REPO = 'https://github.com/RVC-Boss/GPT-SoVITS'
GPT_SOVITS_PORT = 9880

OUTPUT_DIR = 'tts_output'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Text cleaning
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
#  SERVICE CHECKS
# ==================================================

def check_service(url, name, timeout=2):
    try:
        r = requests.get(url, timeout=timeout)
        return True
    except:
        return False

def wait_for_gpt_sovits(timeout=120):
    print(f"[..] Waiting for GPT-SoVITS API at {GPT_SOVITS_API}...")
    for i in range(timeout):
        if check_service(GPT_SOVITS_API, 'GPT-SoVITS'):
            print(f"[OK] GPT-SoVITS ready in {i+1}s")
            return True
        time.sleep(1)
        if (i + 1) % 10 == 0:
            print(f"     ...still waiting ({i+1}s)")
    print(f"[ERROR] GPT-SoVITS did not start within {timeout}s")
    return False


# ==================================================
#  GPT-SOVITS AUTO INSTALL
# ==================================================

def clone_gpt_sovits():
    """Clone GPT-SoVITS repository."""
    print(f"[..] Cloning GPT-SoVITS to ./{GPT_SOVITS_DIR}/...")
    try:
        result = subprocess.run(
            ['git', 'clone', GPT_SOVITS_REPO, GPT_SOVITS_DIR],
            check=True,
            capture_output=True,
            text=True
        )
        print("[OK] Repository cloned")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Git clone failed: {e.stderr}")
        return False
    except FileNotFoundError:
        print("[ERROR] Git not found. Please install Git first.")
        return False

def install_gpt_sovits_deps():
    """Install GPT-SoVITS Python dependencies."""
    print("[..] Installing GPT-SoVITS dependencies...")
    print("     (This may take 5-15 minutes depending on your network)")
    print()
    
    # Install extra requirements first (no deps)
    print("  [..] Installing extra requirements...")
    extra_req = os.path.join(GPT_SOVITS_DIR, 'extra-req.txt')
    if os.path.exists(extra_req):
        try:
            subprocess.check_call(
                [sys.executable, '-m', 'pip', 'install', '-r', extra_req, '--no-deps'],
                cwd=GPT_SOVITS_DIR
            )
            print("  [OK] Extra requirements installed")
        except subprocess.CalledProcessError:
            print("  [WARN] Extra requirements install had errors (continuing)")
    else:
        print("  [..] extra-req.txt not found, skipping")

    # Install main requirements
    print("  [..] Installing main requirements...")
    main_req = os.path.join(GPT_SOVITS_DIR, 'requirements.txt')
    if os.path.exists(main_req):
        try:
            subprocess.check_call(
                [sys.executable, '-m', 'pip', 'install', '-r', main_req],
                cwd=GPT_SOVITS_DIR
            )
            print("  [OK] Main requirements installed")
            return True
        except subprocess.CalledProcessError as e:
            print(f"  [ERROR] Requirements install failed: {e}")
            return False
    else:
        print("  [ERROR] requirements.txt not found")
        return False

def download_pretrained_models():
    """Download pretrained V4 models."""
    print("[..] Downloading pretrained V4 models...")
    print("     (This may take several minutes, ~2GB total)")
    print()
    
    models_dir = os.path.join(GPT_SOVITS_DIR, 'GPT_SoVITS', 'pretrained_models')
    os.makedirs(models_dir, exist_ok=True)
    
    v4_dir = os.path.join(models_dir, 'gsv-v4-pretrained')
    os.makedirs(v4_dir, exist_ok=True)
    
    # Models to download (HuggingFace URLs)
    base_url = 'https://huggingface.co/lj1995/GPT-SoVITS/resolve/main'
    models = [
        ('gsv-v4-pretrained/s1v3.ckpt', os.path.join(v4_dir, 's1v3.ckpt')),
        ('gsv-v4-pretrained/s2v4.pth', os.path.join(v4_dir, 's2v4.pth')),
        ('gsv-v4-pretrained/vocoder.pth', os.path.join(v4_dir, 'vocoder.pth')),
    ]
    
    all_exist = True
    for remote_path, local_path in models:
        if not os.path.exists(local_path) or os.path.getsize(local_path) < 1000:
            all_exist = False
            break
    
    if all_exist:
        print("[OK] All pretrained models already present")
        return True
    
    # Try downloading with huggingface_hub if available
    try:
        from huggingface_hub import hf_hub_download
        for remote_path, local_path in models:
            model_name = os.path.basename(local_path)
            if os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
                print(f"  [OK] {model_name} already exists")
                continue
            
            print(f"  [..] Downloading {model_name}...")
            hf_hub_download(
                repo_id='lj1995/GPT-SoVITS',
                filename=remote_path,
                local_dir=local_path.rsplit(os.sep, 1)[0],
                local_dir_use_symlinks=False
            )
            print(f"  [OK] {model_name} downloaded")
        
        return True
    except ImportError:
        print("  [..] huggingface_hub not installed, trying pip install...")
        try:
            subprocess.check_call(
                [sys.executable, '-m', 'pip', 'install', 'huggingface_hub'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            from huggingface_hub import hf_hub_download
            for remote_path, local_path in models:
                model_name = os.path.basename(local_path)
                if os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
                    print(f"  [OK] {model_name} already exists")
                    continue
                
                print(f"  [..] Downloading {model_name}...")
                hf_hub_download(
                    repo_id='lj1995/GPT-SoVITS',
                    filename=remote_path,
                    local_dir=local_path.rsplit(os.sep, 1)[0],
                    local_dir_use_symlinks=False
                )
                print(f"  [OK] {model_name} downloaded")
            
            return True
        except Exception as e:
            print(f"  [ERROR] Failed to download models: {e}")
            print()
            print("  Manual download required:")
            print(f"  1. Go to: https://huggingface.co/lj1995/GPT-SoVITS/tree/main/gsv-v4-pretrained")
            print(f"  2. Download: s1v3.ckpt, s2v4.pth, vocoder.pth")
            print(f"  3. Place in: {v4_dir}")
            return False
    except Exception as e:
        print(f"  [ERROR] Download failed: {e}")
        return False

def start_gpt_sovits_api():
    """Start GPT-SoVITS API server."""
    print(f"[..] Starting GPT-SoVITS API on port {GPT_SOVITS_PORT}...")
    
    api_script = os.path.join(GPT_SOVITS_DIR, 'api_v2.py')
    if not os.path.exists(api_script):
        print(f"[ERROR] api_v2.py not found at {api_script}")
        return False
    
    try:
        # Start the API server in background
        subprocess.Popen(
            [sys.executable, api_script, '-p', str(GPT_SOVITS_PORT)],
            cwd=GPT_SOVITS_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
        print("[OK] GPT-SoVITS API process started")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to start API: {e}")
        return False

def setup_gpt_sovits():
    """Full setup: clone, install, download models, start API."""
    print("=" * 50)
    print("  GPT-SoVITS Setup")
    print("=" * 50)
    print()
    
    # Step 1: Clone
    if not os.path.exists(os.path.join(GPT_SOVITS_DIR, 'api_v2.py')):
        if not clone_gpt_sovits():
            return False
    else:
        print("[OK] GPT-SoVITS repository already exists")
    print()
    
    # Step 2: Install dependencies
    print("[..] Checking GPT-SoVITS dependencies...")
    if not install_gpt_sovits_deps():
        print("[WARN] Dependency install had issues, continuing anyway...")
    print()
    
    # Step 3: Download models
    if not download_pretrained_models():
        print("[WARN] Some models may be missing, continuing anyway...")
    print()
    
    # Step 4: Start API
    if not start_gpt_sovits_api():
        return False
    
    # Step 5: Wait for API
    print()
    return wait_for_gpt_sovits(timeout=120)


# ==================================================
#  OLLAMA
# ==================================================

def chat_with_ollama(text, model=None):
    model = model or OLLAMA_MODEL
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": text}],
        "stream": False
    }
    start = time.time()
    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=120)
        r.raise_for_status()
        data = r.json()
        response = data.get("message", {}).get("content", "")
        elapsed = time.time() - start
        total_tokens = data.get("eval_count", 0)
        tokens_per_sec = total_tokens / elapsed if elapsed > 0 else 0
        return response, elapsed, tokens_per_sec
    except Exception as e:
        return f"[Ollama error: {e}]", time.time() - start, 0


# ==================================================
#  GPT-SoVITS TTS
# ==================================================

def synthesize_speech(text, ref_audio, speed=1.0):
    if not os.path.exists(ref_audio):
        return None, 0, 0, f"Reference audio not found: {ref_audio}"

    payload = {
        "text": text,
        "text_lang": GPT_SOVITS_TEXT_LANG,
        "ref_audio_path": ref_audio,
        "prompt_lang": GPT_SOVITS_PROMPT_LANG,
        "prompt_text": "",
        "speed_factor": speed,
        "streaming_mode": False,
        "media_type": "wav",
        "top_k": 15,
        "top_p": 1.0,
        "temperature": 1.0,
        "batch_size": 1,
    }

    start = time.time()
    try:
        r = requests.post(f"{GPT_SOVITS_API}/tts", json=payload, timeout=120)
        r.raise_for_status()
        elapsed = time.time() - start

        # Load audio from bytes
        audio_data, sample_rate = sf.read(io.BytesIO(r.content), dtype='float32')
        audio_duration = len(audio_data) / sample_rate
        rtf = elapsed / audio_duration if audio_duration > 0 else 0

        return audio_data, elapsed, rtf, None
    except Exception as e:
        return None, time.time() - start, 0, f"TTS error: {e}"


def play_audio(audio_data, sample_rate=32000):
    try:
        sd.play(audio_data, sample_rate)
        sd.wait()
    except Exception as e:
        print(f"[WARN] Audio playback failed: {e}")


def save_audio(audio_data, filename, sample_rate=32000):
    filepath = os.path.join(OUTPUT_DIR, filename)
    try:
        sf.write(filepath, audio_data, sample_rate)
        return filepath
    except Exception as e:
        print(f"[WARN] Could not save audio: {e}")
        return None


# ==================================================
#  STATS
# ==================================================

class SessionStats:
    def __init__(self):
        self.total_interactions = 0
        self.total_ollama_time = 0
        self.total_tts_time = 0
        self.total_pipeline_time = 0
        self.total_audio_duration = 0
        self.errors = 0

    def record(self, ollama_time, tts_time, audio_duration, pipeline_time, error=False):
        self.total_interactions += 1
        self.total_ollama_time += ollama_time
        self.total_tts_time += tts_time
        self.total_pipeline_time += pipeline_time
        self.total_audio_duration += audio_duration
        if error:
            self.errors += 1

    def show(self):
        if self.total_interactions == 0:
            print("\n  No interactions yet.")
            return

        print("\n" + "=" * 50)
        print("  Session Statistics")
        print("=" * 50)
        print(f"  Interactions   : {self.total_interactions}")
        print(f"  Errors         : {self.errors}")
        print(f"  Avg Ollama     : {self.total_ollama_time / self.total_interactions:.2f}s")
        print(f"  Avg TTS        : {self.total_tts_time / self.total_interactions:.2f}s")
        print(f"  Avg Pipeline   : {self.total_pipeline_time / self.total_interactions:.2f}s")
        print(f"  Total Audio    : {self.total_audio_duration:.1f}s")
        print(f"  Avg RTF        : {self.total_tts_time / self.total_audio_duration:.3f}" if self.total_audio_duration > 0 else "  Avg RTF        : N/A")
        print("=" * 50)


# ==================================================
#  INTERACTIVE LOOP
# ==================================================

def print_help():
    print("\nCommands:")
    print("  quit / exit       - Exit")
    print("  help              - Show this help")
    print("  speed <0.5-2.0>   - Change speech speed")
    print("  ref <path>        - Change reference audio path")
    print("  stats             - Show session statistics")
    print("  setup             - Re-run GPT-SoVITS setup")

def print_setup_instructions():
    print("\n" + "=" * 50)
    print("  Manual GPT-SoVITS Setup")
    print("=" * 50)
    print("""
If auto-install fails, follow these steps:

1. Install conda (if not installed):
   https://docs.anaconda.com/miniconda/

2. Create environment:
   conda create -n gptsovits python=3.10
   conda activate gptsovits

3. Clone repository:
   git clone https://github.com/RVC-Boss/GPT-SoVITS gptsovits
   cd gptsovits

4. Install dependencies:
   pip install -r requirements.txt

5. Download pretrained V4 models:
   From: https://huggingface.co/lj1995/GPT-SoVITS/tree/main
   Files needed in gsv-v4-pretrained/:
   - s1v3.ckpt
   - s2v4.pth
   - vocoder.pth

6. Start API server:
   python api_v2.py -p 9880
""")
    print("=" * 50)


def main():
    print("=" * 50)
    print("  GPT-SoVITS + Ollama TTS Test")
    print("=" * 50)
    print()

    # Configuration
    speed = 1.0
    save_audio_files = True
    ref_audio = None
    session = SessionStats()

    # Check Ollama
    print("[..] Checking Ollama...")
    if check_service("http://localhost:11434", 'Ollama'):
        print("[OK] Ollama is running")
    else:
        print("[ERROR] Ollama not running on port 11434")
        print("  Start with: ollama serve")
        input("\nPress Enter to exit...")
        sys.exit(1)
    print()

    # Check/Setup GPT-SoVITS
    print(f"[..] Checking GPT-SoVITS API at {GPT_SOVITS_API}...")
    if not check_service(GPT_SOVITS_API, 'GPT-SoVITS'):
        print("[INFO] GPT-SoVITS API not running")
        print()
        
        # Ask user if they want to auto-install
        choice = input("  Auto-install GPT-SoVITS? [Y/n]: ").strip().lower()
        if choice in ('y', 'yes', ''):
            print()
            if not setup_gpt_sovits():
                print()
                print("[ERROR] GPT-SoVITS setup failed")
                print_setup_instructions()
                input("\nPress Enter to exit...")
                sys.exit(1)
            print()
        else:
            print("[ERROR] GPT-SoVITS is required for this test")
            print_setup_instructions()
            input("\nPress Enter to exit...")
            sys.exit(1)
    else:
        print("[OK] GPT-SoVITS API is running")
    print()

    # Get reference audio
    print("[..] Reference audio required for GPT-SoVITS")
    while not ref_audio or not os.path.exists(ref_audio):
        user_ref = input("  Enter path to reference WAV file: ").strip().strip('"').strip("'")
        if user_ref.lower() == 'setup':
            print_setup_instructions()
            continue
        if not os.path.exists(user_ref):
            print(f"  [ERROR] File not found: {user_ref}")
            continue
        ref_audio = user_ref

    print(f"[OK] Reference audio: {ref_audio}")
    print()

    # Interactive loop
    print("\n" + "=" * 60)
    print("  INTERACTIVE MODE")
    print("=" * 60)
    print()
    print("Type text and press Enter to generate speech")
    print(f"Model: {OLLAMA_MODEL}")
    print(f"Speed: {speed}x")
    print(f"Ref audio: {ref_audio}")
    print()
    print_help()
    print()

    counter = 0
    while True:
        try:
            user_input = input("> ").strip()

            if not user_input:
                continue

            if user_input.lower() in ('quit', 'exit', 'q'):
                break

            if user_input.lower() == 'help':
                print_help()
                continue

            if user_input.lower() == 'setup':
                print_setup_instructions()
                continue

            if user_input.lower() == 'stats':
                session.show()
                continue

            if user_input.lower().startswith('speed '):
                try:
                    new_speed = float(user_input[6:].strip())
                    if 0.5 <= new_speed <= 2.0:
                        speed = new_speed
                        print(f"[OK] Speed: {speed}x")
                    else:
                        print("[ERROR] Speed must be between 0.5 and 2.0")
                except ValueError:
                    print("[ERROR] Invalid speed value")
                continue

            if user_input.lower().startswith('ref '):
                new_ref = user_input[4:].strip().strip('"').strip("'")
                if os.path.exists(new_ref):
                    ref_audio = new_ref
                    print(f"[OK] Reference audio: {ref_audio}")
                else:
                    print(f"[ERROR] File not found: {new_ref}")
                continue

            # Pipeline
            pipeline_start = time.time()

            # Step 1: Ollama
            print(f"\n[..] Ollama ({OLLAMA_MODEL})...")
            ai_response, ollama_time, tokens_per_sec = chat_with_ollama(user_input)
            cleaned = clean_text(ai_response)

            print(f"[OK] Ollama: {ollama_time:.2f}s ({tokens_per_sec:.1f} tok/s)")
            print(f"    {cleaned[:100]}{'...' if len(cleaned) > 100 else ''}")

            # Step 2: TTS
            print(f"[..] GPT-SoVITS TTS...")
            audio_data, tts_time, rtf, error = synthesize_speech(cleaned, ref_audio, speed)

            if error:
                print(f"[ERROR] {error}")
                session.record(ollama_time, 0, 0, time.time() - pipeline_start, error=True)
                continue

            pipeline_time = time.time() - pipeline_start
            audio_duration = len(audio_data) / 32000

            print(f"[OK] TTS: {tts_time:.2f}s (audio: {audio_duration:.2f}s, RTF: {rtf:.3f})")
            print(f"    Total: {pipeline_time:.2f}s")

            # Save audio
            if save_audio_files:
                counter += 1
                filename = f"output_{counter:03d}.wav"
                filepath = save_audio(audio_data, filename)
                if filepath:
                    print(f"    Saved: {filepath}")

            # Play audio
            print("[..] Playing audio...")
            play_audio(audio_data)

            session.record(ollama_time, tts_time, audio_duration, pipeline_time)
            print()

        except KeyboardInterrupt:
            print("\n\nType 'quit' to exit")
        except EOFError:
            break
        except Exception as e:
            print(f"[ERROR] {e}")
            import traceback
            traceback.print_exc()

    session.show()
    print("\nDone!")


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)
