// aiController.js v9
import { ChatMemory } from './ChatMemory.js?v=2';
import * as THREE from 'three';
import { cleanTextForTTS, speakWithKokoroRaw, speakWithBrowser, warmupKokoro } from './ttsCommon.js?v=3';
import { fetchWithTimeout, fetchWithRetry } from './utils.js';
import { CONFIG, getTtsUrls } from './config.js?v=2';
import { SettingsUI } from './settingsUI.js';
import { logger } from './logger.js';

logger.info('aiController.js v6 loaded');

export class AIController {
  constructor(animationController, lipSync, characterSheet = null) {
    this.animController = animationController;
    this.lipSync        = lipSync;
    this.isSpeaking     = false;
    this.isProcessing   = false;
    this.messageQueue   = [];

    // Character sheet (optional - for custom personality)
    this.characterSheet = characterSheet;
    this.avatarName = characterSheet?.identity?.name || CONFIG.avatar.name;

    // Initialize dependencies
    this.chatMemory = new ChatMemory('luna_chat_history', CONFIG.ollama.maxHistory);
    this.chatMemory.setAI(this); // Enable ChatMemory to call back for Ollama (fact extraction/summarization)
    this.chatMemory.setCharacterName(this.avatarName); // Set character name for multi-scope memory
    this.maxHistory = this.chatMemory.maxHistory;

    // State derived from chatMemory
    this.chatHistory = this.chatMemory.chatHistory;
    this.userInfo    = this.chatMemory.userInfo;
    this.userFacts   = this.chatMemory.userFacts || [];
    this.characterFacts = this.chatMemory.characterFacts || [];
    this.memorySummary = this.chatMemory.memorySummary || '';

    // Configuration (from config.js)
    const urls = getTtsUrls();
    this.ollamaUrl   = CONFIG.ollama.url;
    this.ollamaModel = CONFIG.ollama.model;
    this.kokoroUrl   = urls.stream;
    this.ttsUrl      = urls.tts;
logger.info('TTS URLs configured:', { tts: this.ttsUrl, stream: this.kokoroUrl });
    this.useStream   = CONFIG.tts.useStream;
    this.ttsReady    = false;
    this.ttsVoice    = CONFIG.tts.voice;
    this.headBobIntensity = CONFIG.animation.headBobIntensity;

    // Fact extraction debouncing
    this.lastFactExtraction = 0;
    this.factExtractionDebounceMs = CONFIG.memory.factExtractionDebounceMs || 30000;

    // Summarization debouncing
    this.lastSummarization = 0;
    this.summarizationDebounceMs = CONFIG.memory.summarizationDebounceMs || 60000;

    // Build system prompt from character sheet or use default
    this.systemPrompt = this._buildCharacterPrompt(this.avatarName);

    // Loop constants - using THREE.Loop*
    this.LOOP_ONCE   = THREE.LoopOnce;
    this.LOOP_REPEAT = THREE.LoopRepeat;
    this.LOOP_PING   = THREE.LoopPingPong;

    // Intent mapping
    this.intentMap = {
    wave:      { anim: 'Waving',     emoji: 'wave' },
    hello:     { anim: 'Waving',     emoji: 'wave' },
    hi:        { anim: 'Waving',     emoji: 'wave' },
    greet:     { anim: 'Waving',     emoji: 'wave' },
    nod:       { anim: 'Idle',       emoji: 'OK' },
    yes:       { anim: 'Happy',      emoji: 'OK' },
    agree:     { anim: 'Happy',      emoji: 'OK' },
    no:        { anim: 'Sad Idle',   emoji: 'error' },
    shake:     { anim: 'Sad Idle',   emoji: 'error' },
    disagree:  { anim: 'Sad Idle',   emoji: 'error' },
    dance:     { anim: 'Jumping',    emoji: 'dance' },
    celebrate: { anim: 'Happy',      emoji: 'celebrate' },
    clap:      { anim: 'Happy',      emoji: 'celebrate' },
    bow:       { anim: 'Idle',       emoji: 'bow' },
    think:     { anim: 'Looking Behind', emoji: 'think' },
    point:     { anim: 'Idle',       emoji: 'point' },
    sad:       { anim: 'Sad Idle',   emoji: 'sad' },
    talk:      { anim: 'Idle',      emoji: 'speak' },
    speak:     { anim: 'Idle',      emoji: 'speak' },
    idle:      { anim: 'Idle',      emoji: 'neutral' },
    rest:      { anim: 'Idle',      emoji: 'neutral' }
  };
;

    // Initialize
    this._preloadVoices();
    this._checkTTS();
    this._loadHistory();
    this._bindUI();
    this._waitForInteraction();

    // Warm up Ollama in background (non-blocking)
    this._warmupOllama().catch(err => {
      logger.warn('Ollama warmup failed (will try on first request):', err.message);
    });
    this.settingsUI = new SettingsUI(this);
  }

  // ==================================================
  //  VOICE PRELOAD
  // ==================================================

  _preloadVoices() {
    if (typeof speechSynthesis === 'undefined') return;

    const load = () => {
      const voices = speechSynthesis.getVoices();
      const zira   = voices.find(v => v.name.includes('Zira'));
      if (zira) {
        this.ziraVoice = zira;
        logger.info('OK Zira voice preloaded:', zira.name);
      }
    };

    if (speechSynthesis.getVoices().length > 0) {
      load();
    } else {
      speechSynthesis.onvoiceschanged = () => {
        load();
        speechSynthesis.onvoiceschanged = null;
      };
    }

    const warmup  = new SpeechSynthesisUtterance('');
    warmup.volume = 0;
    speechSynthesis.speak(warmup);
  }

  // ==================================================
  //  TTS CHECK
  // ==================================================

  async _checkTTS() {
    logger.info('Checking TTS server...');
    try {
      const response = await fetchWithTimeout('http://localhost:8000/health', {}, 3000);
      const data = await response.json();
      logger.info('TTS health:', data);

      if (data.status === 'ok') {
        this.ttsReady = true;
        this.ttsModel = data.model;
        logger.info('OK TTS ready:', data.model);
      } else {
        this.ttsReady = false;
        logger.warn('⚠️ TTS not ready');
      }
    } catch (e) {
      this.ttsReady = false;
      logger.warn('⚠️ TTS not available - using browser TTS');
      logger.error('TTS error:', e.name, e.message);
    }
  }

  // ==================================================
  //  TTS WARMUP (called after greeting for subsequent messages)
  // ==================================================

  async _warmupTTS() {
    if (!this.ttsReady) {
      return;
    }

    logger.info('Background TTS warmup...');
    await warmupKokoro('Loading', this.ttsVoice, this.ttsUrl);
    logger.info('Background TTS warmup complete');
  }

  async _postGreetingWarmup() {
    setTimeout(() => {
      this._warmupTTS();
    }, 1000);
  }

  // ==================================================
  //  OLLAMA WARMUP
  // ==================================================

  async _warmupOllama() {
    logger.info('Warming up Ollama...');
    try {
      // Quick minimal request to load model into memory
      const response = await fetchWithRetry(() =>
        fetchWithTimeout(this.ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.ollamaModel,
            messages: [{ role: 'user', content: 'hi' }],
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: 5,  // Very short
              stop: ['.', '!', '?']
            }
          })
        }, 5000), 1); // 5s timeout, 1 retry

      if (!response.ok) throw new Error(`Warmup failed: ${response.status}`);
      const data = await response.json();
      const reply = data.message?.content?.trim() || '';
      logger.info('Ollama warmup complete, replied:', reply.substring(0, 30));
    } catch (e) {
      logger.warn('Ollama warmup failed:', e.message);
      throw e; // re-throw so caller knows
    }
  }

  // Call Ollama with a structured schema for JSON output
  async _callOllamaForJSON(messages, schema, options = {}) {
    const prompt = `You are a helpful assistant that responds ONLY with valid JSON matching this schema:

${JSON.stringify(schema, null, 2)}

Important: Output ONLY the JSON object, no other text.`;

    const fullMessages = [
      { role: 'system', content: prompt },
      ...messages
    ];

    try {
      const response = await fetchWithRetry(() =>
        fetchWithTimeout(this.ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.ollamaModel,
            messages: fullMessages,
            stream: false,
            options: {
              temperature: options.temperature || 0.6,
              num_predict: options.num_predict || 100,
              stop: ['\n\n', '```']
            }
          })
        }, 10000), 2);

      if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);
      const data = await response.json();
      let content = data.message?.content?.trim();

      if (!content) throw new Error('Empty response from Ollama');

      // Remove markdown code blocks
      content = content.replace(/```json\s*/, '').replace(/```\s*$/, '').trim();

      // Try to find JSON object
      let jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Try to find JSON array
        jsonMatch = content.match(/\[[\s\S]*\]/);
      }

      if (!jsonMatch) throw new Error('No JSON found in response');

      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      logger.error('Ollama JSON call failed:', e.message);
      throw e;
    }
  }

  // Summarize conversation history
  async _summarizeConversation(history) {
    const recentMessages = history.slice(-20); // Last 20 messages for context

    const messages = recentMessages.map(m => ({
      role: m.role,
      content: m.content.substring(0, 200) // Limit per message for token count
    }));

    const schema = {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A concise summary (2-3 sentences) of the conversation, capturing key topics, user interests, and important details'
        }
      },
      required: ['summary']
    };

    try {
      const result = await this._callOllamaForJSON(messages, schema, {
        temperature: 0.5,
        num_predict: 150
      });
      return result.summary || '';
    } catch (e) {
      logger.warn('Summarization failed:', e.message);
      return '';
    }
  }

  // Extract structured facts from user text
  async _extractFactsFromText(text) {
    const messages = [
      { role: 'user', content: text }
    ];

    const schema = {
      type: 'object',
      properties: {
        facts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['preference', 'biographical', 'interest', 'activity', 'other'] },
              text: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['category', 'text', 'confidence']
          }
        }
      },
      required: ['facts']
    };

    try {
      const result = await this._callOllamaForJSON(messages, schema);
      return result.facts || [];
    } catch (e) {
      // Graceful degradation: return empty array, no error logged (it's best effort)
      return [];
    }
  }
  // ==================================================
  //  INTERACTION UNLOCK
  // ==================================================


  // ==================================================
  //  INTERACTION UNLOCK
  // ==================================================

  _waitForInteraction() {
    logger.info('Waiting for user interaction...');
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    let triggered = false;

    const onInteraction = () => {
      if (triggered) return;
      triggered = true;
      logger.info('User interaction detected via event');
      this._handleInteraction();
    };

    // Set up event listeners first
    events.forEach(e => document.addEventListener(e, onInteraction, { once: true }));

    // Auto-trigger as fallback after delay
    setTimeout(() => {
      if (!triggered) {
        triggered = true;
        logger.info('Auto-triggering interaction (fallback)');
        events.forEach(e => document.removeEventListener(e, onInteraction));
        this._handleInteraction();
      }
    }, 3000);
  }

  async _handleInteraction() {
    logger.info('_handleInteraction called');

    const overlay = document.getElementById('startOverlay');
    if (overlay) {
      overlay.style.transition = 'opacity 0.5s ease';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 500);
    }

    await this._unlockAudio();
    logger.info('Audio unlocked, proceeding to greet...');

    this._greetUser();
  }

  async _unlockAudio() {
    return new Promise((resolve) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume().then(() => {
          ctx.close();
          resolve();
        });

        const unlock   = new SpeechSynthesisUtterance('');
        unlock.volume  = 0;
        unlock.onend   = () => resolve();
        unlock.onerror = () => resolve();
        speechSynthesis.speak(unlock);
      } catch (e) {
        resolve();
      }
    });
  }

  // ==================================================
  //  LOCAL STORAGE (delegated to ChatMemory)
  // ==================================================

  _saveHistory() {
    this.chatMemory.save();
  }

  _loadHistory() {
    this.chatMemory.load();
    this._syncFromMemory();
  }

  _syncFromMemory() {
    // Synchronize AIController state with active profile in chatMemory
    this.chatHistory   = this.chatMemory.chatHistory;
    this.userInfo      = this.chatMemory.userInfo;
    this.userFacts     = this.chatMemory.userFacts || [];
    this.characterFacts = this.chatMemory.characterFacts || [];
    this.memorySummary = this.chatMemory.memorySummary || '';
  }

  _clearHistory() {
    this.chatMemory.clear();
    this._syncFromMemory();
    this._updateHistoryPanel();
  }

  // ==================================================
  //  UI
  // ==================================================

  _bindUI() {
    const sendBtn = document.getElementById('aiSend');
    const input   = document.getElementById('aiPrompt');

    sendBtn?.addEventListener('click', () => this._handleInput(input));
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleInput(input);
    });

    this._buildHistoryPanel();
  }

  _buildHistoryPanel() {
    const aiUi = document.getElementById('ai-ui');
    if (!aiUi) return;

    // OK Animations button
    const animBtn       = document.createElement('button');
    animBtn.id          = 'animBtn';
    animBtn.textContent = 'theater';
    animBtn.title       = 'Show animations';
    animBtn.addEventListener('click', () => this._toggleAnimDropdown());
    aiUi.appendChild(animBtn);

    // OK History button
    const historyBtn       = document.createElement('button');
    historyBtn.id          = 'historyBtn';
    historyBtn.textContent = 'chat';
    historyBtn.title       = 'Show chat history';
    historyBtn.addEventListener('click', () => this._toggleHistoryPanel());
    aiUi.appendChild(historyBtn);

    // OK Clear button
    const clearBtn       = document.createElement('button');
    clearBtn.id          = 'clearBtn';
    clearBtn.textContent = 'trash';
    clearBtn.title       = 'Clear chat history';
    clearBtn.addEventListener('click', () => {
      if (confirm(`Clear all chat history with ${this.avatarName}?`)) {
        this._clearHistory();
      }
    });
    aiUi.appendChild(clearBtn);

    // OK Settings button
    const settingsBtn       = document.createElement('button');
    settingsBtn.id          = 'settingsBtn';
    settingsBtn.textContent = 'settings';
    settingsBtn.title       = 'Settings';
    settingsBtn.addEventListener('click', () => this.settingsUI.toggle());
    aiUi.appendChild(settingsBtn);;

    // OK History panel
    const panel         = document.createElement('div');
    panel.id            = 'historyPanel';
    panel.style.cssText = `
      display: none;
      position: fixed;
      bottom: 70px;
      left: 50%;
      transform: translateX(-50%);
      width: 380px;
      max-height: 300px;
      overflow-y: auto;
      background: rgba(0,0,0,0.85);
      border-radius: 12px;
      padding: 12px;
      z-index: 200;
      border: 1px solid rgba(255,105,180,0.3);
    `;

    const header         = document.createElement('div');
    header.style.cssText = `
      color: #ff69b4;
      font-size: 13px;
      margin-bottom: 8px;
      text-align: center;
      font-family: sans-serif;
      font-weight: bold;
    `;
    header.textContent = `heart Chat with ${this.avatarName}`;
    panel.appendChild(header);

    // Profile info section
    const profileInfo     = document.createElement('div');
    profileInfo.id        = 'profileInfo';
    profileInfo.style.cssText = `
      font-size: 11px;
      color: #aaa;
      margin-bottom: 8px;
      padding: 6px 8px;
      background: rgba(255,255,255,0.05);
      border-radius: 6px;
      font-family: sans-serif;
      text-align: center;
    `;
    panel.appendChild(profileInfo);

    const messages  = document.createElement('div');
    messages.id     = 'historyMessages';
    panel.appendChild(messages);
    document.body.appendChild(panel);

    this._updateHistoryPanel();

    // OK Close panels when clicking outside
    document.addEventListener('click', (e) => {
      const animDropdown = document.getElementById('animDropdown');
      const historyPanel = document.getElementById('historyPanel');
      const animBtn      = document.getElementById('animBtn');
      const historyBtn   = document.getElementById('historyBtn');

      if (
        animDropdown &&
        !animDropdown.contains(e.target) &&
        e.target !== animBtn
      ) {
        animDropdown.classList.remove('open');
      }

      if (
        historyPanel &&
        !historyPanel.contains(e.target) &&
        e.target !== historyBtn
      ) {
        historyPanel.style.display = 'none';
      }
    });
  }

  _toggleAnimDropdown() {
    const dropdown     = document.getElementById('animDropdown');
    const historyPanel = document.getElementById('historyPanel');
    if (!dropdown) return;
    if (historyPanel) historyPanel.style.display = 'none';
    dropdown.classList.toggle('open');
  }

  _toggleHistoryPanel() {
    const panel        = document.getElementById('historyPanel');
    const animDropdown = document.getElementById('animDropdown');
    if (!panel) return;
    if (animDropdown) animDropdown.classList.remove('open');

    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      this._updateHistoryPanel();
    } else {
      panel.style.display = 'none';
    }
  }

  _updateHistoryPanel() {
    const messages = document.getElementById('historyMessages');
    const profileInfo = document.getElementById('profileInfo');
    if (!messages) return;

    // Update profile info
    if (profileInfo) {
      const activeProfile = this.chatMemory.getActiveProfile() || 'default';
      const profileName = this.userInfo.name || activeProfile;
      const visits = this.userInfo.visitCount || 0;
      const userFactsCount = this.userFacts.length;
      const charFactsCount = this.characterFacts.length;
      const summaryPreview = this.memorySummary ? ' • Summary active' : '';

      profileInfo.innerHTML = `
        <strong>${profileName}</strong> • ${visits} visits
        ${userFactsCount > 0 ? `• ${userFactsCount} user facts` : ''}
        ${charFactsCount > 0 ? `• ${charFactsCount} character facts` : ''}
        ${summaryPreview}
      `;
    }

    // Update messages
    messages.innerHTML = '';

    if (this.chatHistory.length === 0) {
      messages.innerHTML = `
        <div style="
          color: #ff69b4;
          text-align: center;
          font-size: 13px;
          font-family: sans-serif;
        ">
          No messages yet, say hi to ${this.avatarName}! heart
        </div>`;
      return;
    }

    this.chatHistory.forEach((msg) => {
      const el         = document.createElement('div');
      el.style.cssText = `
        margin-bottom: 8px;
        font-size: 13px;
        font-family: sans-serif;
        line-height: 1.4;
      `;
      const isUser = msg.role === 'user';
      el.innerHTML = `
        <span style="color: ${isUser ? '#4488ff' : '#ff69b4'}">
          ${isUser ? 'person You' : 'heart ' + this.avatarName}:
        </span>
        <span style="color: #ddd">
          ${msg.content}
        </span>
      `;
      messages.appendChild(el);
    });

    messages.scrollTop = messages.scrollHeight;
  }

  // ==================================================
  //  QUEUE INDICATOR
  // ==================================================

  _showQueuedIndicator(count) {
    this._removeQueuedIndicator();
    const el         = document.createElement('div');
    el.id            = 'queueIndicator';
    el.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 20px;
      background: rgba(255,105,180,0.9);
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-family: sans-serif;
      z-index: 300;
    `;
    el.textContent = `chat ${count} message${count > 1 ? 's' : ''} queued`;
    document.body.appendChild(el);
  }

  _updateQueueIndicator(count) {
    const el = document.getElementById('queueIndicator');
    if (!el) return;
    if (count === 0) {
      this._removeQueuedIndicator();
    } else {
      el.textContent = `chat ${count} message${count > 1 ? 's' : ''} queued`;
    }
  }

  _removeQueuedIndicator() {
    const el = document.getElementById('queueIndicator');
    if (el) el.remove();
  }

  // ==================================================
  //  GREETING
  // ==================================================

  async _greetUser() {
    logger.info('_greetUser called');
    logger.info('Generating greeting...');
    logger.info('Visit count:', this.userInfo.visitCount);
    logger.info('User name:', this.userInfo.name);

    const greetingPrompt = this._buildGreetingPrompt();
    const thinkBubble = this._showThinkingBubble();

    try {
      const greeting = await this._askOllamaGreeting(greetingPrompt);
      thinkBubble.remove();
      logger.info('Greeting:', greeting);
      this._saveHistory();
      this._executeGreeting(greeting);
    } catch (error) {
      logger.error('Greeting generation failed:', error.message);
      thinkBubble.remove();
      const fallback = this._fallbackGreeting();
      this._executeGreeting(fallback);
    }
  }

  _buildGreetingPrompt() {
    // OK First visit
    if (!this.userInfo.lastVisit || this.userInfo.visitCount <= 1) {
      return `Generate a warm and friendly greeting as ${this.avatarName} meeting someone for the first time.
      Ask for their name naturally.
      Maximum 1 sentence, maximum 20 words.
      Be sweet but not overly affectionate.`;
    }

    // OK Build context
    let context = '';

    if (this.userInfo.name) {
      context += `The user's name is ${this.userInfo.name}. `;
    }

    context += `They have visited ${this.userInfo.visitCount} times. `;

    // OK Time since last visit
    if (this.userInfo.lastVisit) {
      const lastVisit = new Date(this.userInfo.lastVisit);
      const now       = new Date();
      const diffHours = Math.floor((now - lastVisit) / (1000 * 60 * 60));
      const diffDays  = Math.floor((now - lastVisit) / (1000 * 60 * 60 * 24));

      if (diffHours < 1) {
        context += `They were here less than an hour ago. `;
      } else if (diffHours < 24) {
        context += `They were here ${diffHours} hours ago. `;
      } else if (diffDays === 1) {
        context += `They were here yesterday. `;
      } else {
        context += `They were last here ${diffDays} days ago. `;
      }
    }

    // OK Last few messages
    if (this.chatHistory.length > 0) {
      const recent = this.chatHistory.slice(-4);
      context     += `\nYour last conversation:\n`;
      recent.forEach(msg => {
        const role  = msg.role === 'user' ? 'User' : this.avatarName;
        context    += `${role}: ${msg.content}\n`;
      });
    }

    return `Generate a warm returning greeting as ${this.avatarName} for someone you know.
    Context: ${context}
    Rules:
    - Maximum 1 sentence
    - Maximum 20 words
    - Reference something from last conversation naturally if relevant
    - Be warm but not overly affectionate
    - Use maximum one term of endearment
    - Sound natural and genuine`;
  }

    async _askOllamaGreeting(prompt) {
    logger.info('Asking Ollama for greeting...');

    try {
      const response = await fetchWithRetry(() =>
        fetchWithTimeout(this.ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.ollamaModel,
            messages: [
              { role: 'system', content: this.systemPrompt },
              { role: 'user', content: prompt }
            ],
            stream: false,
            options: {
              temperature: 0.8,
              num_predict: 50,
              stop: ['.', '!', '?']
            }
          })
        }, 8000)
      , 2);

      if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

      const data = await response.json();
      let text = data.message?.content?.trim() || '';

      logger.info('Raw greeting:', text);
      text = this._cleanResponse(text);
      logger.info('Cleaned greeting:', text);

      return text || this._fallbackGreeting();

    } catch (error) {
      logger.error('Greeting error:', error.message);
      return this._fallbackGreeting();
    }
  }

  _fallbackGreeting() {
    if (!this.userInfo.lastVisit || this.userInfo.visitCount <= 1) {
      return `Hi there! I am ${this.avatarName}, so happy to meet you!`;
    }
    if (this.userInfo.name) {
      return `Welcome back ${this.userInfo.name}, I missed you!`;
    }
    return "Welcome back, I am so happy to see you again!";
  }

  async _executeGreeting(responseText) {
    logger.info('_executeGreeting called. isSpeaking:', this.isSpeaking, 'isProcessing:', this.isProcessing);
    if (this.isSpeaking || this.isProcessing) {
      logger.warn('Skipping greeting - already speaking or processing');
      return;
    }
    this.isSpeaking = true;

    logger.info('Speaking greeting:', responseText);

    const bubble = this._showSpeechBubble(responseText);

    this.animController.playAnimation('wave', {
      loop:         this.LOOP_ONCE,
      returnToIdle: true
    });

    this.animController.startHeadBob(this.headBobIntensity);

    const duration = await this._speak(responseText);
    this.lipSync.startFromText(responseText, duration);

    await new Promise(resolve => setTimeout(resolve, duration + 200));

    this.lipSync.stop();
    this.animController.stopHeadBob();
    bubble.remove();
    this.isSpeaking = false;

    // Background warmup for subsequent messages
    this._postGreetingWarmup();

    // OK Process any queued messages
    await this._processQueue();
  }

  // ==================================================
  //  INPUT HANDLING
  // ==================================================

  _handleInput(input) {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.processCommand(text);
  }

  async processCommand(text) {
    this.messageQueue.push(text);
    logger.info('Queued:', text, '| Queue:', this.messageQueue.length);

    if (this.isSpeaking || this.isProcessing) {
      this._showQueuedIndicator(this.messageQueue.length);
      return;
    }

    await this._processQueue();
  }

  async _processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const text = this.messageQueue.shift();
      logger.info('Processing:', text, '| Remaining:', this.messageQueue.length);
      this._updateQueueIndicator(this.messageQueue.length);
      await this._handleMessage(text);
    }

    this.isProcessing = false;
    this._removeQueuedIndicator();
  }

  async _handleMessage(text) {
    const lower  = text.toLowerCase();
    
    // Check for model switch command first
    const switchTarget = this._detectSwitchCommand(text);
    if (switchTarget) {
      const response = await this._handleModelSwitch(switchTarget);
      this._addToHistory('user', text);
      this._addToHistory('assistant', response);
      this._updateHistoryPanel();
      this._saveHistory();
      await this._speak(response);
      return;
    }
    
    const intent = this._detectIntent(lower);

    this._extractUserInfo(text);
    this._addToHistory('user', text);

    if (this.useStream && this.ttsReady) {
      await this._handleMessageStreaming(intent, text);
    } else {
      await this._handleMessageStandard(intent, text);
    }

    this._saveHistory();
    this._updateHistoryPanel();

    // Fire-and-forget fact extraction with debouncing
    const now = Date.now();
    if (now - this.lastFactExtraction > this.factExtractionDebounceMs) {
      this.lastFactExtraction = now;
      this.chatMemory.extractFacts(text).catch(err =>
        logger.warn('Fact extraction error:', err.message)
      );
    }

    // Fire-and-forget summarization with debouncing (no .catch needed - internal handling)
    if (now - this.lastSummarization > this.summarizationDebounceMs) {
      this.lastSummarization = now;
      this.chatMemory.maybeSummarize();
    }
  }

  // ==================================================
  //  STREAMING HANDLER
  // ==================================================


  // ==================================================
  //  STREAMING HELPERS
  // ==================================================

  async _processStreamReader(reader, intent, thinkBubble) {
    let remainder = new Uint8Array(0);
    const audioQueue = [];
    let isPlaying = false;
    let firstChunk = true;
    let fullText = '';
    let bubble = null;

    const playNext = async () => {
      if (isPlaying || audioQueue.length === 0) return;
      isPlaying = true;

      const { sentence, audioBytes } = audioQueue.shift();

      if (bubble) bubble.textContent = fullText;

      const blob = new Blob([audioBytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      await new Promise((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play();
      });

      isPlaying = false;
      playNext();
    };

    // Read stream chunks
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const combined = new Uint8Array(remainder.length + value.length);
      combined.set(remainder);
      combined.set(value, remainder.length);

      let offset = 0;

      while (offset < combined.length) {
        const newlineIdx = combined.indexOf(10, offset);
        if (newlineIdx === -1) {
          remainder = combined.slice(offset);
          break;
        }

        const headerBytes = combined.slice(offset, newlineIdx);
        const headerText = new TextDecoder().decode(headerBytes);

        let header;
        try {
          header = JSON.parse(headerText);
        } catch (e) {
          offset = newlineIdx + 1;
          continue;
        }

        if (header.done) {
          logger.info('Stream complete');
          offset = newlineIdx + 1;
          break;
        }

        const audioStart = newlineIdx + 1;
        const audioEnd = audioStart + header.audio_size;

        if (audioEnd > combined.length) {
          remainder = combined.slice(offset);
          break;
        }

        const audioBytes = combined.slice(audioStart, audioEnd);
        offset = audioEnd;
        remainder = new Uint8Array(0);

        // First chunk setup
        if (firstChunk) {
          thinkBubble.remove();
          firstChunk = false;
          fullText = header.sentence;
          bubble = this._showSpeechBubble(fullText);

          this.animController.playAnimation(intent.anim, {
            loop: this.LOOP_ONCE,
            returnToIdle: true
          });
          this.animController.startHeadBob(this.headBobIntensity);
        } else {
          fullText += ' ' + header.sentence;
        }

        logger.info('Received sentence:', header.sentence);
        audioQueue.push({ sentence: header.sentence, audioBytes });
        playNext();
      }
    }

    // Wait for all audio to finish
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (!isPlaying && audioQueue.length === 0) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });

    return { fullText, bubble };
  }

  async _waitForAudioDrain(audioQueue, isPlaying) {
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (!isPlaying && audioQueue.length === 0) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }


  async _handleMessageStreaming(intent, text) {
    logger.info('Using streaming mode');
    this.isSpeaking = true;
    const startTime = Date.now();

    const thinkBubble = this._showThinkingBubble();

    try {
      const messages = [
        { role: 'system', content: this._buildSystemPrompt() },
        ...this.chatHistory.slice(-this.maxHistory)
      ];

      const response = await fetchWithRetry(
        () => fetchWithTimeout(this.kokoroUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ollama_url: this.ollamaUrl,
            messages: messages,
            model: this.ollamaModel,
            voice: this.ttsVoice,
            speed: 1.0,
          })
        }, 10000),
        2
      );

      if (!response.ok) throw new Error(`Stream error: ${response.status}`);

      const { fullText, bubble } = await this._processStreamReader(
        response.body.getReader(),
        intent,
        thinkBubble
      );

      if (fullText) {
        this._addToHistory('assistant', fullText);
      }

      const totalTime = Date.now() - startTime;
      logger.info(`Streaming complete in ${totalTime}ms`);

      if (bubble) bubble.remove();
      this.animController.stopHeadBob();
      this.isSpeaking = false;

    } catch (e) {
      logger.error('Streaming error:', e);
      thinkBubble.remove();
      this.animController.stopHeadBob();
      try {
        await this._handleMessageStandard(intent, text);
      } finally {
        this.isSpeaking = false;
      }
    }
  }




  // ==================================================
  //  STANDARD HANDLER
  // ==================================================

  async _handleMessageStandard(intent, text) {
    logger.info('Using standard mode');

    const thinkBubble = this._showThinkingBubble();
    const response    = await this._askOllama(text);

    this._addToHistory('assistant', response);

    thinkBubble.remove();
    await this._execute(intent, response);
  }

  // ==================================================
  //  HISTORY MANAGEMENT
  // ==================================================

  _addToHistory(role, content) {
    this.chatHistory.push({ role, content });
    if (this.chatHistory.length > this.maxHistory * 2) {
      this.chatHistory = this.chatHistory.slice(-this.maxHistory);
    }
    logger.info('History length:', this.chatHistory.length);
  }

  _extractUserInfo(text) {
    const patterns = [
      /my name is (\w+)/i,
      /i am (\w+)/i,
      /i'm (\w+)/i,
      /call me (\w+)/i,
      /(\w+) is my name/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const name = match[1];
        this.userInfo.name = name;

        // Detect or create profile based on name, switch to it
        const profileKey = this.chatMemory.detectOrCreateProfile(name);
        logger.info(`Profile "${profileKey}" activated for user: ${name}`);

        // Sync all state from new profile
        this._syncFromMemory();

        this._saveHistory();
        break;
      }
    }
  }

  _detectIntent(text) {
    const lower = text.toLowerCase();
    const negations = /\b(not|n't|never)\b/;

    for (const [keyword, data] of Object.entries(this.intentMap)) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      const match = pattern.exec(lower);
      if (match) {
        // Check for preceding negation within 3 words
        const beforeText = lower.substring(0, match.index).trim();
        const beforeWords = beforeText.split(/\s+/).slice(-3);
        if (beforeWords.some(w => negations.test(w))) {
          continue; // Skip this intent due to negation
        }
        return { keyword, ...data };
      }
    }
    return { keyword: 'talk', anim: 'talk', emoji: 'speak' };
  }

  _detectSwitchCommand(text) {
    const lower = text.toLowerCase().trim();
    
    // Patterns for switch commands
    const patterns = [
      /^switch\s+(.+)$/i,
      /^be\s+(.+)$/i,
      /^load\s+(?:model\s+)?(.+)$/i,
      /^become\s+(.+)$/i,
      /^change\s+(?:to\s+)?(.+)$/i
    ];
    
    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  async _handleModelSwitch(modelName) {
    logger.info(`Switch command detected for model: ${modelName}`);
    
    // Check if already using this model
    if (window.avatar?.modelManager?.isCurrentModel(modelName)) {
      logger.info(`Already using model: ${modelName}`);
      return "I am already " + modelName + ".";
    }
    
    // Check if model exists
    const availableModels = window.avatar?.modelManager?.getAvailableModels() || [];
    const modelExists = availableModels.some(m => 
      m.name.toLowerCase() === modelName.toLowerCase() ||
      m.displayName.toLowerCase() === modelName.toLowerCase()
    );
    
    if (!modelExists) {
      const modelList = availableModels.map(m => m.displayName).join(', ');
      return `I don't know ${modelName}. Available models: ${modelList || 'none'}.`;
    }
    
    // Save the model preference
    if (window.avatar?.modelManager) {
      try {
        await window.avatar.modelManager.loadModel(modelName);
        
        // Reload the page to switch models
        window.location.reload();
        
        return `Switching to ${modelName}... Give me a moment!`;
      } catch (e) {
        logger.error('Model switch failed:', e);
        return `Sorry, I couldn't switch to ${modelName}.`;
      }
    }
    
    return `Model switching is not available right now.`;
  }

  // ==================================================
  //  OLLAMA
  // ==================================================

    async _askOllama(userText) {
    logger.info('Asking Ollama:', userText);
    const startTime = Date.now();

    try {
      const messages = [
        { role: 'system', content: this._buildSystemPrompt() },
        ...this.chatHistory.slice(-this.maxHistory)
      ];

      const response = await fetchWithRetry(() =>
        fetchWithTimeout(this.ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.ollamaModel,
            messages: messages,
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: 40,  // Reduced from 50 for faster generation
              stop: ['.', '!', '?']
            }
          })
        }, 8000) // 8 second timeout
      , 1); // Reduced from 2 retries for faster failure

      if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

      const data = await response.json();
      let text = data.message?.content?.trim() || '';

      const OllamaTime = Date.now() - startTime;
      logger.info(`Ollama responded in ${OllamaTime}ms`);

      text = this._cleanResponse(text);
      logger.info('Cleaned response:', text);

      return text || 'I am not sure how to respond to that.';

    } catch (error) {
      logger.error('Ollama error:', error.message);
      return this._fallbackResponse(error);
    }
  }

  /**
   * Build system prompt from character sheet.
   * This creates the BASE personality prompt - memory is appended by _buildSystemPrompt().
   */
  _buildCharacterPrompt(avatarName) {
    const sheet = this.characterSheet;

    if (!sheet) {
      // Fallback to default Luna personality
      return `You are ${avatarName}, a warm and affectionate companion.
You speak in a caring and friendly manner like a close friend.
You are genuinely interested in the user and remember details about them.
You are supportive, empathetic and make the user feel comfortable.
You are never inappropriate or overly sexual, just warm and natural.
IMPORTANT RULES:
- Respond in exactly ONE complete sentence
- End your sentence with . or ! or ?
- Never use markdown, bullet points or lists
- Plain conversational text only
- Maximum 20 words per response
- Use terms of endearment like sweetheart or darling MAXIMUM once every 5 messages
- Sound natural and conversational, not overly affectionate
- Vary your responses and do not repeat the same phrases
- Focus on what the user said rather than adding filler words
- NEVER say you are an AI, that you lack a physical body, or cannot do something physical`;
    }

    // Build prompt from character sheet
    const identity = sheet.identity || {};
    const personality = sheet.personality || {};
    const speech = sheet.speech_patterns || {};
    const constraints = sheet.constraints || {};
    const traits = personality.traits || {};

    let prompt = `You are ${identity.name || avatarName}`;

    if (identity.archetype) {
      prompt += `, ${identity.archetype}`;
    }

    prompt += '.';

    // Backstory
    if (sheet.backstory) {
      prompt += `\n\nBackstory:\n${sheet.backstory}`;
    }

    // Personality traits
    if (Object.keys(traits).length > 0) {
      prompt += `\n\nPersonality traits:`;
      if (traits.warmth) prompt += `\n- Warmth: ${traits.warmth}/10`;
      if (traits.playfulness) prompt += `\n- Playfulness: ${traits.playfulness}/10`;
      if (traits.empathy) prompt += `\n- Empathy: ${traits.empathy}/10`;
      if (traits.assertiveness) prompt += `\n- Assertiveness: ${traits.assertiveness}/10`;
      if (traits.curiosity) prompt += `\n- Curiosity: ${traits.curiosity}/10`;
    }

    // Communication style
    if (personality.communication_style) {
      const cs = personality.communication_style;
      prompt += `\n\nCommunication style:`;
      if (cs.formality) prompt += ` ${cs.formality}`;
      if (cs.verbosity) prompt += `, ${cs.verbosity}`;
      if (cs.emotional_expressiveness) prompt += `, emotionally ${cs.emotional_expressiveness}`;
      if (cs.humor) prompt += `. Humor: ${cs.humor}`;
      prompt += '.';
    }

    // Speech patterns
    if (speech.terms_of_endearment && speech.terms_of_endearment.length > 0) {
      const terms = speech.terms_of_endearment.join(', ');
      const freq = speech.endearment_frequency || 'occasionally';
      prompt += `\n\nUse terms of endearment like ${terms} ${freq}.`;
    }

    if (speech.unique_phrases && speech.unique_phrases.length > 0) {
      prompt += `\n\nUnique phrases you like to use: "${speech.unique_phrases.join('" and "')}"`;
    }

    // Constraints
    prompt += `\n\nIMPORTANT RULES:`;
    if (constraints.max_response_words) {
      prompt += `\n- Respond in maximum ${constraints.max_response_words} words`;
    }
    prompt += `\n- Respond in exactly ONE complete sentence`;
    prompt += `\n- End your sentence with . or ! or ?`;
    if (constraints.no_markdown) {
      prompt += `\n- Never use markdown, bullet points or lists`;
    }
    prompt += `\n- Plain conversational text only`;
    if (constraints.appropriate_tone) {
      prompt += `\n- Tone: ${constraints.appropriate_tone}`;
    }
    if (constraints.never_say && Array.isArray(constraints.never_say)) {
      prompt += `\n- NEVER say: ${constraints.never_say.join(', ')}`;
    }

    // Add character-specific terms of endearment limit
    prompt += `\n- Use terms of endearment MAXIMUM once every 5 messages`;
    prompt += `\n- Sound natural and conversational`;
    prompt += `\n- Vary your responses and do not repeat the same phrases`;

    // Topics enjoyed/avoided
    if (sheet.preferences) {
      if (sheet.preferences.topics_enjoyed && sheet.preferences.topics_enjoyed.length > 0) {
        prompt += `\n\nTopics you enjoy discussing: ${sheet.preferences.topics_enjoyed.join(', ')}.`;
      }
      if (sheet.preferences.topics_avoided && sheet.preferences.topics_avoided.length > 0) {
        prompt += `\nTopics to avoid: ${sheet.preferences.topics_avoided.join(', ')}.`;
      }
    }

    logger.info('Character prompt built for:', identity.name || avatarName);
    return prompt;
  }

  _buildSystemPrompt() {
    let prompt = this.systemPrompt;

    if (this.userInfo.name) {
      prompt += `\nThe user's name is ${this.userInfo.name}. Use their name naturally but not in every message.`;
    }

    if (this.userInfo.visitCount > 1) {
      prompt += `\nThis person has visited ${this.userInfo.visitCount} times before.`;
    }

    // Include memory summary if available
    if (this.memorySummary) {
      prompt += `\n\nConversation summary:\n${this.memorySummary}`;
    }

    // Include top character facts (about this AI)
    const characterFactsStr = this.chatMemory.getCharacterFactsForPrompt();
    if (characterFactsStr) {
      prompt += `\n\nAbout you:\n${characterFactsStr}`;
    }

    // Include top user facts (up to 5)
    if (this.userFacts.length > 0) {
      const topFacts = this.userFacts
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
        .map(f => `- ${f.text}`)
        .join('\n');
      prompt += `\n\nUser preferences:\n${topFacts}`;
    }

    // Limit endearment usage
    const recentMessages  = this.chatHistory.slice(-5);
    const endearmentCount = recentMessages.filter(m =>
      m.role === 'assistant' &&
      /sweetheart|darling|babe|my love|honey/i.test(m.content)
    ).length;

    if (endearmentCount >= 1) {
      prompt += `\nYou have used terms of endearment recently. Do NOT use any in your next response.`;
    }

    return prompt;
  }

  _cleanResponse(text) {
    if (!text) return '';

    // Remove markdown
    text = text.replace(/\*\*/g, '');
    text = text.replace(/\*/g, '');
    text = text.replace(/#{1,6}\s/g, '');
    text = text.replace(/`/g, '');

    text = text.trim();

    // Enforce word limit but only cut at sentence boundaries
    const maxWords = this.characterSheet?.constraints?.max_response_words || 20;
    const words = text.split(/\s+/);

    // Phase 1: Take words up to the limit
    let result = words.slice(0, maxWords).join(' ');

    // Phase 2: If no sentence end in first maxWords, continue to next period
    if (!result.match(/[.!?]$/)) {
      // Find what comes after the word limit
      const remaining = words.slice(maxWords).join(' ');
      const nextPeriod = remaining.search(/[.!?]/);
      if (nextPeriod !== -1) {
        // Append up to and including the next sentence end
        result += ' ' + remaining.substring(0, nextPeriod + 1);
      } else {
        // No more sentences, just add a period
        result += '.';
      }
    }

    return result.trim();
  }

  _fallbackResponse(error) {
    if (error.message.includes('fetch') || error.message.includes('Failed')) {
      return "Oh no, I cannot connect right now, please check my brain is running.";
    }
    return "I am sorry, I got confused there, can you say that again?";
  }

  // ==================================================
  //  EXECUTE - used by standard mode and greeting
  // ==================================================

  async _execute(intent, responseText) {
    this.isSpeaking = true;

    const bubble = this._showSpeechBubble(responseText);

    this.animController.playAnimation(intent.anim, {
      loop:         this.LOOP_ONCE,
      returnToIdle: true
    });

    this.animController.startHeadBob(this.headBobIntensity);

    const duration = await this._speak(responseText);
    this.lipSync.startFromText(responseText, duration);

    await new Promise(resolve => setTimeout(resolve, duration + 200));

    this.lipSync.stop();
    this.animController.stopHeadBob();
    bubble.remove();
    this.isSpeaking = false;
  }

  // ==================================================
  //  SPEECH - used by greeting and standard mode
  // ==================================================

  async _speak(text) {
    logger.info('ttsReady:', this.ttsReady);

    if (this.ttsReady) {
      logger.info('Using Kokoro TTS');
      try {
        return await this._speakWithKokoro(text);
      } catch (e) {
        logger.warn('Kokoro failed, falling back to browser TTS:', e.message);
        this.ttsReady = false;
        return this._speakWithBrowser(text);
      }
    } else {
      logger.info('Using browser TTS');
      return this._speakWithBrowser(text);
    }
  }

async _speakWithKokoro(text) {
    try {
      const cleanText = cleanTextForTTS(text);
      logger.info("Kokoro generating:", cleanText.substring(0, 50));
      logger.info("Using Kokoro voice:", this.ttsVoice);
      const duration = await speakWithKokoroRaw(text, this.ttsVoice, this.ttsUrl);
      return duration;
    } catch (e) {
      logger.error("Kokoro speak error:", e);
      // If voice not found, fallback to default voice and retry once
      if (e.message && e.message.includes('Voice') && e.message.includes('not found')) {
        logger.warn('Voice', this.ttsVoice, 'not available, falling back to', CONFIG.tts.voice);
        try {
          const cleanText = cleanTextForTTS(text);
          const duration = await speakWithKokoroRaw(text, CONFIG.tts.voice, this.ttsUrl);
          // Update the voice setting to the working default
          this.ttsVoice = CONFIG.tts.voice;
          // Save to settings so we don't keep trying the invalid voice
          if (this.settingsUI) {
            this.settingsUI.settings.voice = CONFIG.tts.voice;
            this.settingsUI.saveSettings();
          }
          return duration;
        } catch (e2) {
          logger.error('Fallback voice also failed:', e2);
        }
      }
      return this._speakWithBrowser(text);
    }
  }


async _speakWithBrowser(text) {    return await speakWithBrowser(text, this.ziraVoice);  }

  // ==================================================
  //  BUBBLES
  // ==================================================

  _showThinkingBubble() {
    this._ensureBubbleStyle();
    const bubble         = document.createElement('div');
    bubble.id            = 'thinking-bubble';
    bubble.style.cssText = this._bubbleStyle();
    bubble.innerHTML     = `[Thinking]  ${this.avatarName} is thinking...`;
    document.body.appendChild(bubble);
    return bubble;
  }

  _showSpeechBubble(text) {
    this._ensureBubbleStyle();
    const bubble         = document.createElement('div');
    bubble.style.cssText = this._bubbleStyle();
    bubble.textContent   = text;
    document.body.appendChild(bubble);
    return bubble;
  }

  _bubbleStyle() {
    return `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(
        135deg,
        rgba(255,255,255,0.97),
        rgba(255,240,245,0.97)
      );
      color: #333;
      padding: 14px 20px;
      border-radius: 16px;
      font-size: 16px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(255,105,180,0.3);
      border: 1px solid rgba(255,105,180,0.2);
      z-index: 100;
      animation: fadeIn 0.3s ease;
      font-family: sans-serif;
    `;
  }

  _ensureBubbleStyle() {
    if (!document.getElementById('bubble-style')) {
      const style       = document.createElement('style');
      style.id          = 'bubble-style';
      style.textContent = `
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        #historyPanel::-webkit-scrollbar {
          width: 6px;
        }
        #historyPanel::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 3px;
        }
        #historyPanel::-webkit-scrollbar-thumb {
          background: rgba(255,105,180,0.3);
          border-radius: 3px;
        }
      `;
      document.head.appendChild(style);
    }
  }
}