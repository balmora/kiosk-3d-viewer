"""
Zonos TTS API Server
Runs on http://localhost:8000
"""

import os
import sys
import ctypes

# ✅ Disable torch compilation FIRST - no Visual C++ needed
os.environ['TORCHDYNAMO_DISABLE']  = '1'
os.environ['TORCH_COMPILE_DISABLE'] = '1'
os.environ['TORCH_INDUCTOR_DISABLE'] = '1'

# ✅ eSpeak paths
ESPEAK_DIR  = r'C:\Program Files\eSpeak NG'
ESPEAK_EXE  = r'C:\Program Files\eSpeak NG\espeak-ng.exe'
ESPEAK_DATA = r'C:\Program Files\eSpeak NG\espeak-ng-data'
ESPEAK_DLL  = r'C:\Program Files\eSpeak NG\libespeak-ng.dll'

# ✅ Add espeak to PATH
os.environ['PATH']                   = ESPEAK_DIR + ';' + os.environ.get('PATH', '')
os.environ['ESPEAK_DATA_PATH']       = ESPEAK_DATA
os.environ['PHONEMIZER_ESPEAK_PATH'] = ESPEAK_EXE

# ✅ Load DLL
try:
    ctypes.cdll.LoadLibrary(ESPEAK_DLL)
    print(f"✅ eSpeak DLL loaded")
except Exception as e:
    print(f"⚠️ DLL load warning: {e}")

# ✅ Set phonemizer library
try:
    from phonemizer.backend.espeak.espeak import EspeakBackend
    EspeakBackend.set_library(ESPEAK_DLL)
    print(f"✅ Phonemizer library set")
except Exception as e:
    print(f"⚠️ Phonemizer set_library warning: {e}")

import torch

# ✅ Disable dynamo after torch import
try:
    import torch._dynamo
    torch._dynamo.config.suppress_errors = True
    torch._dynamo.disable()
    print("✅ Torch dynamo disabled")
except Exception as e:
    print(f"⚠️ Dynamo disable warning: {e}")

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import io

# ✅ soundfile
try:
    import soundfile as sf
    import numpy as np
    SOUNDFILE_AVAILABLE = True
    print("✅ soundfile available")
except ImportError:
    SOUNDFILE_AVAILABLE = False
    print("⚠️ soundfile not available")

app = Flask(__name__)
CORS(app)

print("Loading Zonos model...")

def load_audio(path):
    try:
        if SOUNDFILE_AVAILABLE:
            data, sr = sf.read(path)
            wav = torch.from_numpy(data).float()
            if wav.dim() == 1:
                wav = wav.unsqueeze(0)
            elif wav.dim() == 2:
                wav = wav.T
            return wav, sr
    except Exception as e:
        print(f"soundfile failed: {e}")
    import torchaudio
    return torchaudio.load(path)

def save_audio(buffer, wav, sample_rate):
    try:
        if SOUNDFILE_AVAILABLE:
            audio_np = wav.squeeze().numpy()
            sf.write(buffer, audio_np, sample_rate, format='WAV')
            return
    except Exception as e:
        print(f"soundfile save failed: {e}")
    import torchaudio
    torchaudio.save(buffer, wav, sample_rate, format="wav")

try:
    from zonos.model import Zonos
    from zonos.conditioning import make_cond_dict

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Using device: {device}")

    model = Zonos.from_pretrained(
        "Zyphra/Zonos-v0.1-transformer",
        device=device
    )
    model.eval()

    SPEAKER_WAV = "./voice/luna_voice.wav"
    speaker     = None

    if os.path.exists(SPEAKER_WAV):
        try:
            wav, sr  = load_audio(SPEAKER_WAV)
            speaker  = model.make_speaker_embedding(wav, sr)
            print(f"✅ Speaker voice loaded from {SPEAKER_WAV}")
        except Exception as e:
            print(f"⚠️ Could not load speaker voice: {e}")
            speaker = None
    else:
        print(f"⚠️ No speaker voice at {SPEAKER_WAV}")

    print("✅ Zonos model loaded successfully!")
    MODEL_LOADED = True

except Exception as e:
    print(f"❌ Failed to load Zonos: {e}")
    import traceback
    traceback.print_exc()
    MODEL_LOADED = False

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status":        "ok" if MODEL_LOADED else "error",
        "model_loaded":  MODEL_LOADED,
        "device":        "cuda" if torch.cuda.is_available() else "cpu",
        "speaker_voice": os.path.exists(SPEAKER_WAV),
        "espeak_exe":    os.path.exists(ESPEAK_EXE),
        "espeak_dll":    os.path.exists(ESPEAK_DLL),
        "soundfile":     SOUNDFILE_AVAILABLE
    })

@app.route('/tts', methods=['POST'])
def tts():
    if not MODEL_LOADED:
        return jsonify({"error": "Zonos model not loaded"}), 500

    try:
        data = request.get_json()
        text = data.get('text', '')

        if not text:
            return jsonify({"error": "No text provided"}), 400

        print(f"Generating: {text[:50]}...")

        cond_dict = make_cond_dict(
            text          = text,
            speaker       = speaker,
            language      = "en-us",
            speaking_rate = data.get('rate', 15.0),
            emotion       = data.get('emotion',
                [0.3077, 0.0256, 0.0256, 0.0256, 0.0256, 0.0256, 0.2564, 0.3077]
            ),
        )

        conditioning = model.prepare_conditioning(cond_dict)

        with torch.no_grad():
            codes = model.generate(conditioning)
            wav   = model.autoencoder.decode(codes).cpu()

        buffer = io.BytesIO()
        save_audio(
            buffer,
            wav.squeeze(0),
            model.autoencoder.sampling_rate
        )
        buffer.seek(0)

        print("✅ Speech generated successfully")
        return send_file(
            buffer,
            mimetype      = "audio/wav",
            as_attachment = False,
            download_name = "speech.wav"
        )

    except Exception as e:
        print(f"❌ TTS error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/clone', methods=['POST'])
def clone_voice():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    try:
        file = request.files['file']
        os.makedirs('./voice', exist_ok=True)
        file.save(SPEAKER_WAV)

        global speaker
        wav, sr  = load_audio(SPEAKER_WAV)
        speaker  = model.make_speaker_embedding(wav, sr)

        return jsonify({"status": "✅ Voice cloned successfully"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/test', methods=['GET'])
def test():
    if not MODEL_LOADED:
        return jsonify({"error": "Model not loaded"}), 500

    try:
        print("Generating test speech...")

        cond_dict = make_cond_dict(
            text     = "Hello! I am Luna, your AI companion. How are you today?",
            speaker  = speaker,
            language = "en-us",
        )

        conditioning = model.prepare_conditioning(cond_dict)

        with torch.no_grad():
            codes = model.generate(conditioning)
            wav   = model.autoencoder.decode(codes).cpu()

        buffer = io.BytesIO()
        save_audio(buffer, wav.squeeze(0), model.autoencoder.sampling_rate)
        buffer.seek(0)

        print("✅ Test speech generated")
        return send_file(
            buffer,
            mimetype      = "audio/wav",
            as_attachment = False,
            download_name = "test.wav"
        )

    except Exception as e:
        print(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 40)
    print(" Zonos TTS Server")
    print("=" * 40)
    print(f" eSpeak exe:  {'✅' if os.path.exists(ESPEAK_EXE)  else '❌'}")
    print(f" eSpeak dll:  {'✅' if os.path.exists(ESPEAK_DLL)  else '❌'}")
    print(f" eSpeak data: {'✅' if os.path.exists(ESPEAK_DATA) else '❌'}")
    print(f" Speaker wav: {'✅' if os.path.exists('./voice/luna_voice.wav') else '❌'}")
    print("=" * 40)
    print(" Health: http://localhost:8000/health")
    print(" Test:   http://localhost:8000/test")
    print("=" * 40)
    app.run(
        host  = '0.0.0.0',
        port  = 8000,
        debug = False
    )