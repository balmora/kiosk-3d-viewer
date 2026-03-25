import {
  cleanTextForTTS,
  speakWithKokoro,
  speakWithBrowser,
  preloadZiraVoice
} from './ttsCommon.js';

export class TTSManager {
  constructor(
    ttsUrl = CONFIG.tts.baseUrl + CONFIG.tts.ttsEndpoint,
    useStream = CONFIG.tts.useStream,
    voice = CONFIG.tts.voice
  ) {
    this.ttsUrl = ttsUrl;
    this.useStream = useStream;
    this.defaultVoice = voice;
    this.voice = voice;
    this.isReady = false;
    this.ziraVoice = null;
    this.preloadQueued = false;
  }

  async preload() {
    if (typeof speechSynthesis === 'undefined') {
      this.preloadQueued = true;
      return;
    }

    const voice = await preloadZiraVoice();
    this.ziraVoice = voice || null;

    // Warm up utterance at volume 0
    const warmup = new SpeechSynthesisUtterance('');
    warmup.volume = 0;
    speechSynthesis.speak(warmup);
    this.preloadQueued = false;
  }

  async _checkReady(useFallback = false) {
    if (this.isReady) return;

    try {
      const response = await fetchWithTimeout(CONFIG.tts.baseUrl + CONFIG.tts.healthEndpoint, {}, 3000);
      const data = await response.json();
      this.isReady = data.status === 'ok';
      console.log('TTS health:', data);
    } catch (e) {
      console.warn('TTS check failed, possible offline mode:', e.message);
      this.isReady = false;
    }

    if (useFallback) {
      this.isReady = true; // Force fallback mode if requested
    }
  }

  async speak(text) {
    await this._checkReady();
    if (this.isReady) {
      return await speakWithKokoro(text, this.voice, this.ttsUrl);
    } else {
      return await speakWithBrowser(text, this.ziraVoice);
    }
  }
}
