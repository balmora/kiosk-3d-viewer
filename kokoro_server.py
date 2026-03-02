"""
Kokoro TTS API Server
Runs on http://localhost:8000
Fast streaming TTS for Luna
"""

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

    # ✅ Paths to model files
    MODEL_PATH  = "./voice/kokoro-v1.0.onnx"
    VOICES_PATH = "./voice/voices-v1.0.bin"

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    if not os.path.exists(VOICES_PATH):
        raise FileNotFoundError(f"Voices not found: {VOICES_PATH}")

    kokoro = Kokoro(MODEL_PATH, VOICES_PATH)

    print("✅ Kokoro model loaded!")
    MODEL_LOADED = True

except Exception as e:
    print(f"❌ Failed to load Kokoro: {e}")
    import traceback
    traceback.print_exc()
    MODEL_LOADED = False

# ==================================================
#  HELPERS
# ==================================================

def clean_text(text):
    """Clean text before TTS"""

    # ✅ Remove emojis
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

    # ✅ Remove markdown
    text = re.sub(r'\*\*?(.*?)\*\*?', r'\1', text)
    text = re.sub(r'#{1,6}\s', '', text)
    text = re.sub(r'`', '', text)

    # ✅ Fix special characters
    text = text.replace('&', 'and')
    text = text.replace('@', 'at')
    text = text.replace('#', '')
    text = text.replace('...', '.')
    text = text.replace('\u2019', "'")
    text = text.replace('\u2018', "'")
    text = text.replace('\u201c', '')
    text = text.replace('\u201d', '')

    # ✅ Clean whitespace
    text = ' '.join(text.split()).strip()

    return text


def text_to_wav(text, voice='af_jessica', speed=1.0): # af_sarah
    """Convert text to wav bytes using Kokoro"""
    samples, sample_rate = kokoro.create(
        text,
        voice = voice,
        speed = speed,
        lang  = "en-us"
    )

    # ✅ Convert to wav bytes
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
        "model_file":   os.path.exists("./kokoro-v1.0.onnx"),
        "voices_file":  os.path.exists("./voices-v1.0.bin"),
    })


@app.route('/tts', methods=['POST'])
def tts():
    """Standard TTS endpoint"""
    if not MODEL_LOADED:
        return jsonify({"error": "Kokoro not loaded"}), 500

    try:
        data  = request.get_json()
        text  = data.get('text', '')
        voice = data.get('voice', 'af_sarah')  # ✅ female voice
        speed = data.get('speed', 1.0)

        if not text:
            return jsonify({"error": "No text provided"}), 400

        text = clean_text(text)
        if not text:
            return jsonify({"error": "Text empty after cleaning"}), 400

        print(f"TTS: {text[:60]}...")

        buffer, _ = text_to_wav(text, voice, speed)

        print("✅ TTS generated")
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

        # ✅ Stream from Ollama
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

            for line in response.iter_lines():
                if not line:
                    continue

                try:
                    chunk = json.loads(line)
                    token = chunk.get('message', {}).get('content', '')

                    if not token:
                        continue

                    buffer_text += token

                    # ✅ Check if we have a complete sentence
                    sentence_match = re.search(r'[.!?]', buffer_text)

                    if sentence_match:
                        # Extract complete sentence
                        end_pos  = sentence_match.start() + 1
                        sentence = buffer_text[:end_pos].strip()
                        buffer_text = buffer_text[end_pos:].strip()

                        if len(sentence) < 3:
                            continue

                        sentence = clean_text(sentence)
                        if not sentence:
                            continue

                        print(f"Streaming sentence: {sentence}")

                        try:
                            # ✅ Generate audio for this sentence
                            samples, sample_rate = kokoro.create(
                                sentence,
                                voice = voice,
                                speed = speed,
                                lang  = "en-us"
                            )

                            # ✅ Convert to wav bytes
                            wav_buffer = io.BytesIO()
                            import soundfile as sf
                            sf.write(wav_buffer, samples, sample_rate, format='WAV')
                            wav_bytes = wav_buffer.getvalue()

                            # ✅ Send sentence text and audio size as header
                            header = json.dumps({
                                "sentence":    sentence,
                                "audio_size":  len(wav_bytes),
                                "sample_rate": sample_rate
                            }) + '\n'

                            yield header.encode()
                            yield wav_bytes

                        except Exception as e:
                            print(f"Sentence TTS error: {e}")
                            continue

                    # ✅ Check if done
                    if chunk.get('done', False):
                        # Process any remaining text
                        if buffer_text.strip():
                            remaining = clean_text(buffer_text.strip())
                            if remaining and len(remaining) > 3:
                                print(f"Final chunk: {remaining}")
                                try:
                                    samples, sample_rate = kokoro.create(
                                        remaining,
                                        voice = voice,
                                        speed = speed,
                                        lang  = "en-us"
                                    )
                                    wav_buffer = io.BytesIO()
                                    sf.write(wav_buffer, samples, sample_rate, format='WAV')
                                    wav_bytes  = wav_buffer.getvalue()

                                    header = json.dumps({
                                        "sentence":    remaining,
                                        "audio_size":  len(wav_bytes),
                                        "sample_rate": sample_rate,
                                        "final":       True
                                    }) + '\n'

                                    yield header.encode()
                                    yield wav_bytes
                                except Exception as e:
                                    print(f"Final chunk TTS error: {e}")

                        # ✅ Send done signal
                        done_signal = json.dumps({"done": True}) + '\n'
                        yield done_signal.encode()
                        break

                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(f"Stream error: {e}")
                    continue

        return Response(
            stream_with_context(generate()),
            mimetype = 'application/octet-stream'
        )

    except Exception as e:
        print(f"❌ Stream error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/voices', methods=['GET'])
def list_voices():
    """List available Kokoro voices"""
    voices = {
        "female_american": [
            "af_sarah",    # ✅ recommended for Luna
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
        test_text = "Hello! I am Luna, your AI companion. How are you today?"
        test_text = clean_text(test_text)

        print(f"Test: {test_text}")

        buffer, _ = text_to_wav(test_text, 'af_sarah', 1.0)

        print("✅ Test generated")
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


# ==================================================
#  START SERVER
# ==================================================

if __name__ == '__main__':
    print("=" * 40)
    print(" Kokoro TTS Server")
    print("=" * 40)
    print(f" Model file:   {'✅' if os.path.exists('./kokoro-v1.0.onnx') else '❌'}")
    print(f" Voices file:  {'✅' if os.path.exists('./voices-v1.0.bin')  else '❌'}")
    print(f" Model loaded: {'✅' if MODEL_LOADED else '❌'}")
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