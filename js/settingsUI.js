import { logger } from './logger.js';
import { CONFIG, getLogLevel } from './config.js';

export class SettingsUI {
  constructor(aiController) {
    this.aiController = aiController;
    this.panel = null;
    this.storageKey = 'luna_settings';
    this.settings = this.loadSettings();
    this.applySettings();
  }
  applySettings() {
    this.aiController.ttsVoice = this.settings.voice;
    this.aiController.headBobIntensity = this.settings.headBobIntensity;
    // Also configure global logger
    if (window.logger) window.logger.setLevel(this.settings.logLevel);
    else logger.setLevel(this.settings.logLevel);
  }

  applySettings() {
    this.aiController.ttsVoice = this.settings.voice;
    this.aiController.headBobIntensity = this.settings.headBobIntensity;
    logger.setLevel(this.settings.logLevel);
  }

  loadSettings() {
    let saved = null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) saved = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load settings:', e);
    }

    // Validate voice and auto-correct if needed
    const validVoices = ['af_sarah', 'af_bella', 'am_adam', 'am_lewis', 'bf_emma', 'bf_isabella'];
    let voice = CONFIG.tts.voice;
    let logLevel = CONFIG.logging.level;
    let headBobIntensity = CONFIG.animation.headBobIntensity;

    if (saved) {
      if (saved.voice && validVoices.includes(saved.voice)) {
        voice = saved.voice;
      } else if (saved.voice) {
        console.warn('Invalid voice in settings:', saved.voice, '- correcting to', CONFIG.tts.voice);
        saved.voice = CONFIG.tts.voice; // fix it
      }
      logLevel = saved.logLevel || logLevel;
      headBobIntensity = saved.headBobIntensity || headBobIntensity;
    }

    // Persist correction if we fixed something
    if (saved && saved.voice !== (saved.voice && validVoices.includes(saved.voice) ? saved.voice : CONFIG.tts.voice)) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(saved));
        console.log('Settings corrected and saved');
      } catch (e) {
        console.error('Failed to save corrected settings:', e);
      }
    }

    return { voice, logLevel, headBobIntensity };
  }

  saveSettings() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  buildPanel() {
    if (this.panel) return;

    const panel = document.createElement('div');
    panel.id = 'settingsPanel';
    panel.style.cssText = `
      display: none;
      position: fixed;
      bottom: 70px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      background: rgba(0,0,0,0.9);
      border-radius: 12px;
      padding: 16px;
      z-index: 200;
      border: 1px solid rgba(255,105,180,0.3);
      font-family: sans-serif;
      color: #fff;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'color:#ff69b4;font-weight:bold;margin-bottom:12px;text-align:center;';
    title.textContent = `settings ${CONFIG.avatar.name} Settings`;
    panel.appendChild(title);

    // Voice selector
    const voiceLabel = document.createElement('label');
    voiceLabel.textContent = 'Voice:';
    voiceLabel.style.display = 'block';
    voiceLabel.style.marginBottom = '4px';
    voiceLabel.style.color = '#ccc';
    panel.appendChild(voiceLabel);

    const voiceSelect = document.createElement('select');
    voiceSelect.style.width = '100%';
    voiceSelect.style.marginBottom = '12px';
    voiceSelect.style.padding = '6px';
    voiceSelect.style.borderRadius = '4px';
    voiceSelect.style.border = '1px solid #ff69b4';
    voiceSelect.style.background = '#222';
    voiceSelect.style.color = '#fff';
    ['af_sarah', 'af_bella', 'am_adam', 'am_lewis', 'bf_emma'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === this.settings.voice) opt.selected = true;
      voiceSelect.appendChild(opt);
    });
    voiceSelect.addEventListener('change', (e) => {
      this.settings.voice = e.target.value;
      this.aiController.ttsVoice = e.target.value; // update runtime
      this.saveSettings();
    });
    panel.appendChild(voiceSelect);

    // Head bob intensity
    const bobLabel = document.createElement('label');
    bobLabel.textContent = `Head bob intensity: ${this.settings.headBobIntensity}`;
    bobLabel.style.display = 'block';
    bobLabel.style.marginBottom = '4px';
    bobLabel.style.color = '#ccc';
    panel.appendChild(bobLabel);

    const bobSlider = document.createElement('input');
    bobSlider.type = 'range';
    bobSlider.min = 0;
    bobSlider.max = 1;
    bobSlider.step = 0.1;
    bobSlider.value = this.settings.headBobIntensity;
    bobSlider.style.width = '100%';
    bobSlider.style.marginBottom = '12px';
    bobSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      bobLabel.textContent = `Head bob intensity: ${val}`;
      this.settings.headBobIntensity = val;
      this.aiController.headBobIntensity = val; // if controller has such property
      this.saveSettings();
    });
    panel.appendChild(bobSlider);

    // Log level
    const logLabel = document.createElement('label');
    logLabel.textContent = 'Log level:';
    logLabel.style.display = 'block';
    logLabel.style.marginBottom = '4px';
    logLabel.style.color = '#ccc';
    panel.appendChild(logLabel);

    const logSelect = document.createElement('select');
    logSelect.style.width = '100%';
    logSelect.style.marginBottom = '12px';
    logSelect.style.padding = '6px';
    logSelect.style.borderRadius = '4px';
    logSelect.style.border = '1px solid #ff69b4';
    logSelect.style.background = '#222';
    logSelect.style.color = '#fff';
    ['debug', 'info', 'warn', 'error'].forEach(level => {
      const opt = document.createElement('option');
      opt.value = level;
      opt.textContent = level;
      if (level === this.settings.logLevel) opt.selected = true;
      logSelect.appendChild(opt);
    });
    logSelect.addEventListener('change', (e) => {
      this.settings.logLevel = e.target.value;
      this.saveSettings();
      // Apply immediately if logger is accessible (we'd need to configure globally)
      // Could dispatch event or have a global logger config
      if (window.logger) {
        window.logger.minLevel = getLogLevel(this.settings.logLevel);
      }
    });
    panel.appendChild(logSelect);

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (panel.style.display === 'block' &&
          panel.contains(e.target) &&
          !e.target.closest('#settingsBtn')) {
        panel.style.display = 'none';
      }
    });

    this.panel = panel;
    document.body.appendChild(panel);
  }

  toggle() {
    if (!this.panel) this.buildPanel();
    this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none';
  }
}
