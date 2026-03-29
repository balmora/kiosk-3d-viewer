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
    title.textContent = `Settings`;
    panel.appendChild(title);

    // Model selector
    const modelLabel = document.createElement('label');
    modelLabel.textContent = 'Model:';
    modelLabel.style.display = 'block';
    modelLabel.style.marginBottom = '4px';
    modelLabel.style.color = '#ccc';
    panel.appendChild(modelLabel);

    const modelSelect = document.createElement('select');
    modelSelect.style.width = '100%';
    modelSelect.style.marginBottom = '12px';
    modelSelect.style.padding = '6px';
    modelSelect.style.borderRadius = '4px';
    modelSelect.style.border = '1px solid #ff69b4';
    modelSelect.style.background = '#222';
    modelSelect.style.color = '#fff';

    // Populate model list
    const models = window.avatar?.modelManager?.getAvailableModels() || [];
    const currentModel = window.avatar?.modelManager?.getCurrentModel();
    
    if (models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No models found';
      modelSelect.appendChild(opt);
    } else {
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.displayName;
        if (currentModel && m.name === currentModel.name) {
          opt.selected = true;
        }
        modelSelect.appendChild(opt);
      });
    }

    modelSelect.addEventListener('change', async (e) => {
      const selectedModel = e.target.value;
      if (selectedModel && selectedModel !== currentModel?.name) {
        // Save the model preference first
        if (window.avatar?.modelManager) {
          await window.avatar.modelManager.loadModel(selectedModel);
        }
        
        // Reload the page to fully reset everything
        window.location.reload();
      }
    });
    panel.appendChild(modelSelect);

    // Current character display
    const charLabel = document.createElement('div');
    charLabel.style.cssText = 'color:#888;font-size:11px;margin-bottom:12px;text-align:center;';
    const charName = window.avatar?.modelManager?.getCurrentModel()?.displayName || 'Unknown';
    charLabel.textContent = `Character: ${charName}`;
    panel.appendChild(charLabel);

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
      if (window.logger) {
        window.logger.minLevel = getLogLevel(this.settings.logLevel);
      }
    });
    panel.appendChild(logSelect);

    // Glow/Spot intensity slider
    const intensityLabel = document.createElement('label');
    intensityLabel.textContent = 'Glow/Spot Intensity: 0';
    intensityLabel.style.display = 'block';
    intensityLabel.style.marginBottom = '4px';
    intensityLabel.style.color = '#ccc';
    panel.appendChild(intensityLabel);

    const intensitySlider = document.createElement('input');
    intensitySlider.type = 'range';
    intensitySlider.min = 0;
    intensitySlider.max = 10;
    intensitySlider.step = 1;
    intensitySlider.value = 0;
    intensitySlider.style.width = '100%';
    intensitySlider.style.marginBottom = '12px';
    intensitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      intensityLabel.textContent = `Glow/Spot Intensity: ${val}`;
      if (window.avatar?.glowSystem) {
        window.avatar.glowSystem.setIntensity(val);
      }
    });
    panel.appendChild(intensitySlider);

    // Spot count input
    const spotLabel = document.createElement('label');
    spotLabel.textContent = 'Spot Count: 0';
    spotLabel.style.display = 'block';
    spotLabel.style.marginBottom = '4px';
    spotLabel.style.color = '#ccc';
    panel.appendChild(spotLabel);

    const spotInput = document.createElement('input');
    spotInput.type = 'number';
    spotInput.min = 0;
    spotInput.max = 24;
    spotInput.value = 0;
    spotInput.style.width = '100%';
    spotInput.style.padding = '6px';
    spotInput.style.marginBottom = '12px';
    spotInput.style.borderRadius = '4px';
    spotInput.style.border = '1px solid #ff69b4';
    spotInput.style.background = '#222';
    spotInput.style.color = '#fff';
    spotInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value) || 0;
      spotLabel.textContent = `Spot Count: ${val}`;
      if (window.avatar?.glowSystem) {
        window.avatar.glowSystem.setSpotCount(val);
      }
    });
    panel.appendChild(spotInput);

    // Spot direction toggle
    const directionLabel = document.createElement('label');
    directionLabel.textContent = 'Spot Direction: Both';
    directionLabel.style.display = 'block';
    directionLabel.style.marginBottom = '4px';
    directionLabel.style.color = '#ccc';
    panel.appendChild(directionLabel);

    const directionBtn = document.createElement('button');
    directionBtn.textContent = 'Both';
    directionBtn.style.width = '100%';
    directionBtn.style.padding = '6px';
    directionBtn.style.marginBottom = '12px';
    directionBtn.style.borderRadius = '4px';
    directionBtn.style.border = '1px solid #ff69b4';
    directionBtn.style.background = '#222';
    directionBtn.style.color = '#fff';
    directionBtn.style.cursor = 'pointer';
    directionBtn.addEventListener('click', () => {
      if (window.avatar?.glowSystem) {
        const newDir = window.avatar.glowSystem.cycleSpotDirection();
        directionLabel.textContent = `Spot Direction: ${newDir.charAt(0).toUpperCase() + newDir.slice(1)}`;
        directionBtn.textContent = newDir.charAt(0).toUpperCase() + newDir.slice(1);
      }
    });
    panel.appendChild(directionBtn);

    // Color picker section
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Glow/Spot Color:';
    colorLabel.style.display = 'block';
    colorLabel.style.marginBottom = '4px';
    colorLabel.style.color = '#ccc';
    panel.appendChild(colorLabel);

    const colorBtnContainer = document.createElement('div');
    colorBtnContainer.style.display = 'flex';
    colorBtnContainer.style.gap = '6px';
    colorBtnContainer.style.marginBottom = '8px';
    colorBtnContainer.style.flexWrap = 'wrap';

    const colorPresets = [
      { name: 'Cyan', hex: '#33A0A4' },
      { name: 'Blue', hex: '#3388FF' },
      { name: 'Purple', hex: '#8833FF' },
      { name: 'Pink', hex: '#FF33AA' },
      { name: 'Red', hex: '#FF3333' },
      { name: 'Green', hex: '#33FF88' },
    ];

    const presetBtns = [];
    colorPresets.forEach(preset => {
      const btn = document.createElement('button');
      btn.textContent = preset.name;
      btn.style.flex = '1';
      btn.style.minWidth = '45px';
      btn.style.padding = '4px';
      btn.style.borderRadius = '4px';
      btn.style.border = '1px solid #ff69b4';
      btn.style.background = preset.hex;
      btn.style.color = preset.hex === '#FF33AA' || preset.hex === '#FF3333' ? '#fff' : '#000';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '10px';
      btn.addEventListener('click', () => {
        if (window.avatar?.glowSystem) {
          window.avatar.glowSystem.setColor(preset.hex);
        }
        presetBtns.forEach(b => b.style.outline = 'none');
        btn.style.outline = '2px solid #fff';
      });
      presetBtns.push(btn);
      colorBtnContainer.appendChild(btn);
    });
    panel.appendChild(colorBtnContainer);

    // RGB sliders
    const rgbContainer = document.createElement('div');
    rgbContainer.style.marginBottom = '12px';

    const createRgbSlider = (channel, color) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.marginBottom = '4px';

      const label = document.createElement('span');
      label.textContent = channel.toUpperCase();
      label.style.width = '15px';
      label.style.color = color;
      label.style.fontWeight = 'bold';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = 0;
      slider.max = 255;
      slider.value = 0;
      slider.style.flex = '1';
      slider.style.accentColor = color;

      const valSpan = document.createElement('span');
      valSpan.textContent = '0';
      valSpan.style.width = '30px';
      valSpan.style.textAlign = 'right';
      valSpan.style.color = '#888';
      valSpan.style.fontSize = '11px';

      slider.addEventListener('input', () => {
        valSpan.textContent = slider.value;
        updateRgbColor();
      });

      wrapper.appendChild(label);
      wrapper.appendChild(slider);
      wrapper.appendChild(valSpan);
      return { wrapper, slider };
    };

    const rgbR = createRgbSlider('r', '#ff6666');
    const rgbG = createRgbSlider('g', '#66ff66');
    const rgbB = createRgbSlider('b', '#6666ff');

    rgbContainer.appendChild(rgbR.wrapper);
    rgbContainer.appendChild(rgbG.wrapper);
    rgbContainer.appendChild(rgbB.wrapper);
    panel.appendChild(rgbContainer);

    function updateRgbColor() {
      const r = parseInt(rgbR.slider.value);
      const g = parseInt(rgbG.slider.value);
      const b = parseInt(rgbB.slider.value);
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      if (window.avatar?.glowSystem) {
        window.avatar.glowSystem.setColor(hex);
      }
      presetBtns.forEach(b => b.style.outline = 'none');
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (panel.style.display === 'block' &&
          !panel.contains(e.target) &&
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
