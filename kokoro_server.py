"""
Kokoro TTS API Server
Runs on http://localhost:8000
Fast streaming TTS for AI companion
"""

import sys
import subprocess
import os

# ==================================================
#  CONFIGURATION
# ==================================================

# Character name for test/development (can be overridden via environment variable)
DEFAULT_CHARACTER_NAME = os.environ.get('KIOSK_CHARACTER_NAME', 'your AI companion')

REQUIRED_PACKAGES = [
    ('flask',       'flask'),
    ('flask_cors',  'flask-cors'),
    ('kokoro_onnx', 'kokoro-onnx'),
    ('soundfile',   'soundfile'),
    ('numpy',       'numpy'),
    ('requests',    'requests'),
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
            sys.exit(1)

print("All packages ready!\n")

import os
import io
import re
import json
import numpy as np

from flask import Flask, request, send_file, jsonify, Response, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ==================================================
#  LOAD KOKORO MODEL
# ==================================================

print("=" * 40)
print(" Loading Kokoro TTS model...")
print("=" * 40)

try:
    from kokoro_onnx import Kokoro

    MODEL_PATH  = "./voice/kokoro-v1.0.onnx"
    VOICES_PATH = "./voice/voices-v1.0.bin"

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    if not os.path.exists(VOICES_PATH):
        raise FileNotFoundError(f"Voices not found: {VOICES_PATH}")

    kokoro = Kokoro(MODEL_PATH, VOICES_PATH)

    print("[OK] Kokoro model loaded!")
    MODEL_LOADED = True

except Exception as e:
    print(f"[ERROR] Failed to load Kokoro: {e}")
    import traceback
    traceback.print_exc()
    MODEL_LOADED = False

# ==================================================
#  HELPERS
# ==================================================

def clean_text(text):
    """Clean text before TTS"""

    # Remove emojis
    emoji_pattern = re.compile(
        "["
        u"\U0001F600-\U0001F64F"
        u"\U0001F300-\U0001F5FF"
        u"\U0001F680-\U0001F9FF"
        u"\U00002702-\U000027B0"
        "]+",
        flags=re.UNICODE
    )
    text = emoji_pattern.sub('', text)

    # Remove markdown
    text = re.sub(r'\*\*?(.*?)\*\*?', r'\1', text)
    text = re.sub(r'#{1,6}\s', '', text)
    text = re.sub(r'`', '', text)

    # Fix special characters
    text = text.replace('&', 'and')
    text = text.replace('@', 'at')
    text = text.replace('#', '')
    text = text.replace('...', '.')
    text = text.replace('\u2019', "'")
    text = text.replace('\u2018', "'")
    text = text.replace('\u201c', '')
    text = text.replace('\u201d', '')

    # Clean whitespace
    text = ' '.join(text.split()).strip()

    return text


def text_to_wav(text, voice='af_sarah', speed=1.0):
    """Convert text to wav bytes using Kokoro"""
    samples, sample_rate = kokoro.create(
        text,
        voice = voice,
        speed = speed,
        lang  = "en-us"
    )

    # Convert to wav bytes
    buffer = io.BytesIO()
    import soundfile as sf
    sf.write(buffer, samples, sample_rate, format='WAV')
    buffer.seek(0)
    return buffer, sample_rate


# ==================================================
#  ROUTES
# ==================================================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status":       "ok" if MODEL_LOADED else "error",
        "model_loaded": MODEL_LOADED,
        "model":        "kokoro-onnx",
        "model_file":   os.path.exists("./voice/kokoro-v1.0.onnx"),
        "voices_file":  os.path.exists("./voice/voices-v1.0.bin"),
    })


@app.route('/tts', methods=['POST'])
def tts():
    """Standard TTS endpoint"""
    if not MODEL_LOADED:
        return jsonify({"error": "Kokoro not loaded"}), 500

    try:
        data  = request.get_json()
        text  = data.get('text', '')
        voice = data.get('voice', 'af_sarah')
        speed = data.get('speed', 1.0)

        if not text:
            return jsonify({"error": "No text provided"}), 400

        text = clean_text(text)
        if not text:
            return jsonify({"error": "Text empty after cleaning"}), 400

        print(f"TTS: {text[:60]}...")

        buffer, _ = text_to_wav(text, voice, speed)

        print("[OK] TTS generated")
        return send_file(
            buffer,
            mimetype      = "audio/wav",
            as_attachment = False,
            download_name = "speech.wav"
        )

    except Exception as e:
        print(f"[ERROR] TTS error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/tts/stream', methods=['POST'])
def tts_stream():
    """
    Streaming TTS endpoint
    Takes Ollama streaming output and converts each sentence to audio
    as it arrives - much faster response time
    """
    if not MODEL_LOADED:
        return jsonify({"error": "Kokoro not loaded"}), 500

    try:
        data        = request.get_json()
        ollama_url  = data.get('ollama_url', 'http://localhost:11434/api/chat')
        messages    = data.get('messages', [])
        model_name  = data.get('model', 'leeplenty/ellaria')
        voice       = data.get('voice', 'af_sarah')
        speed       = data.get('speed', 1.0)

        import requests as req

        # Stream from Ollama
        response = req.post(
            ollama_url,
            json = {
                "model":    model_name,
                "messages": messages,
                "stream":   True,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 50,
                }
            },
            stream = True
        )

        def generate():
            buffer_text = ""
            sent_done = False

            def find_sentence_end(text):
                """Find end of first complete sentence"""
                close_chars = {'"', "'", ")", "]", "}", "\u201c", "\u201d", "\u2018", "\u2019", "»", "›"}
                for m in re.finditer(r"[.!?]", text):
                    i = m.start() + 1  # after punctuation
                    j = i
                    while j < len(text) and text[j] in close_chars:
                        j += 1
                    if j >= len(text) or text[j].isspace():
                        return j
                return None

            def has_meaningful_text(text):
                return re.search(r"[A-Za-z0-9]", text or "") is not None

            def make_chunk(sentence_text, final=False):
                samples, sample_rate = kokoro.create(
                    sentence_text,
                    voice = voice,
                    speed = speed,
                    lang  = "en-us"
                )

                wav_buffer = io.BytesIO()
                import soundfile as sf
                sf.write(wav_buffer, samples, sample_rate, format='WAV')
                wav_bytes = wav_buffer.getvalue()

                header_obj = {
                    "sentence": sentence_text,
                    "audio_size": len(wav_bytes),
                    "sample_rate": sample_rate,
                }
                if final:
                    header_obj["final"] = True

                header = json.dumps(header_obj) + '\n'
                return header.encode(), wav_bytes

            for line in response.iter_lines():
                if not line:
                    continue

                try:
                    chunk = json.loads(line)
                    token = chunk.get('message', {}).get('content', '')

                    # If we got a text token, append and try to emit sentence audio
                    if token:
                        buffer_text += token

                        # Check if we have a complete sentence
                        end_pos = find_sentence_end(buffer_text)
                        if end_pos is not None:
                            # Extract complete sentence
                            sentence = buffer_text[:end_pos].strip()
                            buffer_text = buffer_text[end_pos:].strip()

                            if len(sentence) < 1:
                                continue

                            sentence = clean_text(sentence)
                            if not sentence or not has_meaningful_text(sentence):
                                continue

                            print(f"Streaming sentence: {sentence}")

                            try:
                                header_bytes, wav_bytes = make_chunk(sentence)
                                yield header_bytes
                                yield wav_bytes
                            except Exception as e:
                                print(f"Sentence TTS error: {e}")
                                continue

                    # Check if done
                    if chunk.get('done', False):
                        # Process any remaining text
                        if buffer_text.strip():
                            remaining = clean_text(buffer_text.strip())
                            if remaining and has_meaningful_text(remaining):
                                print(f"Final chunk: {remaining}")
                                try:
                                    header_bytes, wav_bytes = make_chunk(
                                        remaining, final=True
                                    )
                                    yield header_bytes
                                    yield wav_bytes
                                except Exception as e:
                                    print(f"Final chunk TTS error: {e}")

                        # Send done signal
                        done_signal = json.dumps({"done": True}) + '\n'
                        yield done_signal.encode()
                        sent_done = True
                        break

                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(f"Stream error: {e}")
                    continue

            # If Ollama ends without sending done=true, flush remaining text
            if not sent_done:
                if buffer_text.strip():
                    remaining = clean_text(buffer_text.strip())
                    if remaining and has_meaningful_text(remaining):
                        print(f"Final chunk (end-of-stream): {remaining}")
                        try:
                            header_bytes, wav_bytes = make_chunk(
                                remaining, final=True
                            )
                            yield header_bytes
                            yield wav_bytes
                        except Exception as e:
                            print(f"Final chunk TTS error: {e}")

                done_signal = json.dumps({"done": True}) + '\n'
                yield done_signal.encode()

        return Response(
            stream_with_context(generate()),
            mimetype = 'application/octet-stream'
        )

    except Exception as e:
        print(f"[ERROR] Stream error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/voices', methods=['GET'])
def list_voices():
    """List available Kokoro voices"""
    voices = {
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
    return jsonify(voices)


@app.route('/test', methods=['GET'])
def test():
    """Quick test endpoint"""
    if not MODEL_LOADED:
        return jsonify({"error": "Model not loaded"}), 500

    try:
        character_name = os.environ.get('KIOSK_CHARACTER_NAME', DEFAULT_CHARACTER_NAME)
        test_text = f"Hello! I am {character_name}. How are you today?"
        test_text = clean_text(test_text)

        print(f"Test: {test_text}")

        buffer, _ = text_to_wav(test_text, 'af_sarah', 1.0)

        print("[OK] Test generated")
        return send_file(
            buffer,
            mimetype      = "audio/wav",
            as_attachment = False,
            download_name = "test.wav"
        )

    except Exception as e:
        print(f"[ERROR] Test error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ==================================================
#  START SERVER
# ==================================================

if __name__ == '__main__':
    print("=" * 40)
    print(" Kokoro TTS Server")
    print("=" * 40)
    print(f" Model file:   {'[OK]' if os.path.exists('./voice/kokoro-v1.0.onnx') else '[MISSING]'}")
    print(f" Voices file:  {'[OK]' if os.path.exists('./voice/voices-v1.0.bin')  else '[MISSING]'}")
    print(f" Model loaded: {'[OK]' if MODEL_LOADED else '[FAILED]'}")
    print("=" * 40)
    print(" Health:  http://localhost:8000/health")
    print(" Test:    http://localhost:8000/test")
    print(" Voices:  http://localhost:8000/voices")
    print("=" * 40)
    app.run(
        host  = '0.0.0.0',
        port  = 8000,
        debug = False
    )