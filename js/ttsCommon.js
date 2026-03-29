import { fetchWithTimeout, fetchWithRetry } from './utils.js';

/**
 * Shared TTS utilities to eliminate code duplication
 */

/**
 * Clean text for TTS - remove emojis, markdown, etc.
 * @param {string} text
 * @returns {string}
 */
export function cleanTextForTTS(text) {
  if (!text) return '';

  // Remove emojis and symbols
  text = text.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
  text = text.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
  text = text.replace(/[\u{1F680}-\u{1F9FF}]/gu, '');
  text = text.replace(/[\u{2702}-\u{27B0}]/gu, '');
  text = text.replace(/\*\*/g, '');
  text = text.replace(/\*/g, '');
  text = text.replace(/`/g, '');
  text = text.replace(/\.\.\./g, '.');
  text = text.replace(/&/g, 'and');
  text = text.replace(/#/g, '');

  text = text.trim();
  text = text.replace(/\s+/g, ' ');
  return text;
}

/**
 * Silent Kokoro warmup - makes request but doesn't play audio
 * @param {string} text - Text for TTS to process
 * @param {string} voice - Voice ID
 * @param {string} ttsUrl - Kokoro TTS endpoint URL
 * @returns {Promise<void>}
 */
export async function warmupKokoro(text, voice, ttsUrl) {
  const cleanText = cleanTextForTTS(text);
  if (!cleanText) return;

  try {
    const response = await fetchWithRetry(() =>
      fetchWithTimeout(ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voice: voice,
          speed: 1.0,
        })
      }, 10000), 2);

    if (response.ok) {
      await response.blob();
    }
  } catch (e) {
    console.warn('[Kokoro] Warmup failed:', e.message);
  }
}

/**
 * Raw Kokoro TTS - throws on error, does not catch
 * Use when caller wants to handle fallback
 * @param {string} text - Text to speak
 * @param {string} voice - Voice ID
 * @param {string} ttsUrl - Kokoro TTS endpoint URL
 * @returns {Promise<number>} Duration in ms
 */
export async function speakWithKokoroRaw(text, voice, ttsUrl) {
  const cleanText = cleanTextForTTS(text);
  if (!cleanText) {
    throw new Error('Empty text after cleaning');
  }
  const start = Date.now();
  console.log('[Kokoro] Request:', { text: cleanText.substring(0, 50) + (cleanText.length > 50 ? '...' : ''), voice, ttsUrl });

  try {
    const response = await fetchWithRetry(() =>
      fetchWithTimeout(ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voice: voice,
          speed: 1.0,
        })
      }, 10000), 2);

    console.log('[Kokoro] Response status:', response.status, 'content-type:', response.headers.get('content-type'));
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Kokoro HTTP ${response.status}: ${errText.substring(0, 200)}`);
    }

    const blob = await response.blob();
    console.log('[Kokoro] Blob size:', blob.size, 'type:', blob.type);

    if (blob.size === 0) {
      throw new Error('Kokoro returned empty blob');
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        const duration = Date.now() - start;
        console.log('[Kokoro] Audio played successfully in', duration, 'ms');
        resolve(duration);
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        console.error('[Kokoro] Audio element error:', e);
        console.error('[Kokoro] Audio error details:', {
          code: audio.error?.code,
          message: audio.error?.message,
        });
        reject(new Error(`Audio playback failed: ${audio.error?.code || 'unknown'}`));
      };
      audio.play().catch(err => {
        URL.revokeObjectURL(url);
        console.error('[Kokoro] audio.play() failed:', err);
        reject(err);
      });
    });
  } catch (e) {
    console.error('[Kokoro] speakWithKokoroRaw error:', e);
    throw e; // Re-throw for caller to handle
  }
}

/**
 * Speak using Kokoro TTS server (safe version - returns 0 on error)
 * @param {string} text - Text to speak
 * @param {string} voice - Voice ID
 * @param {string} ttsUrl - Kokoro TTS endpoint URL
 * @returns {Promise<number>} Duration in ms, or 0 on error
 */
export async function speakWithKokoro(text, voice, ttsUrl) {
  try {
    return await speakWithKokoroRaw(text, voice, ttsUrl);
  } catch (e) {
    console.error('Kokoro speak error:', e);
    return 0;
  }
}

/**
 * Speak using browser Web Speech API
 * @param {string} text - Text to speak
 * @param {SpeechSynthesisVoice} [voice] - Optional voice to use
 * @returns {Promise<number>} Duration in ms (estimated if speech not supported)
 */
export async function speakWithBrowser(text, voice = null) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve(text.length * 60);
      return;
    }

    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.90;
    utter.pitch = 1.1;
    utter.volume = 1;

    if (voice) {
      utter.voice = voice;
    } else {
      const voices = speechSynthesis.getVoices();
      const found = voices.find(v => v.name.includes('Zira'));
      if (found) utter.voice = found;
    }

    const start = Date.now();
    utter.onend = () => resolve(Date.now() - start);
    utter.onerror = (e) => {
      if (e.error === 'not-allowed') {
        console.warn('Speech not allowed');
      } else if (e.error === 'interrupted') {
        console.warn('Speech interrupted');
      } else {
        console.error('Speech error:', e.error);
      }
      resolve(text.length * 80);
    };
    speechSynthesis.speak(utter);
  });
}

/**
 * Preload Zira voice for browser TTS fallback
 * @returns {SpeechSynthesisVoice|null}
 */
export function preloadZiraVoice() {
  if (typeof speechSynthesis === 'undefined') return null;

  const load = () => {
    const voices = speechSynthesis.getVoices();
    const found = voices.find(v => v.name.includes('Zira'));
    if (found) {
      console.log('OK Zira voice preloaded:', found.name);
      return found;
    }
    return null;
  };

  if (speechSynthesis.getVoices().length > 0) {
    return load();
  } else {
    return new Promise((resolve) => {
      const handler = () => {
        speechSynthesis.onvoiceschanged = null;
        resolve(load());
      };
      speechSynthesis.onvoiceschanged = handler;
    });
  }
}
