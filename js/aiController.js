// aiController.js v6
console.log('aiController.js v6 loaded');

export class AIController {
  constructor(animationController, lipSync) {
    this.animController = animationController;
    this.lipSync        = lipSync;
    this.isSpeaking     = false;
    this.isProcessing   = false;
    this.messageQueue   = [];
    this.ziraVoice      = null;

    // ✅ Ollama settings
    this.ollamaUrl   = 'http://localhost:11434/api/chat';
    this.ollamaModel = 'leeplenty/ellaria';

    // ✅ Kokoro TTS settings
    this.kokoroUrl  = 'http://localhost:8000/tts/stream';
    this.ttsUrl     = 'http://localhost:8000/tts';
    this.useStream  = true;
    this.ttsReady   = false;
    this.ttsVoice   = 'af_sarah';

    // ✅ Luna personality
    this.systemPrompt = `You are Luna, a warm and affectionate AI companion.
    You speak in a caring and friendly manner like a close girlfriend.
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
    - Focus on what the user said rather than adding filler words`;

    // ✅ Loop constants
    this.LOOP_ONCE   = 2200;
    this.LOOP_REPEAT = 2201;
    this.LOOP_PING   = 2202;

    // ✅ Chat history
    this.chatHistory = [];
    this.maxHistory  = 10;
    this.storageKey  = 'luna_chat_history';

    // ✅ User info
    this.userInfo = {
      name:       null,
      lastVisit:  null,
      visitCount: 0,
    };

    // ✅ Intent map
    this.intentMap = {
      wave:      { anim: 'wave',      emoji: '👋' },
      hello:     { anim: 'wave',      emoji: '👋' },
      hi:        { anim: 'wave',      emoji: '👋' },
      greet:     { anim: 'wave',      emoji: '👋' },
      nod:       { anim: 'nod',       emoji: '✅' },
      yes:       { anim: 'nod',       emoji: '✅' },
      agree:     { anim: 'nod',       emoji: '✅' },
      no:        { anim: 'shake',     emoji: '❌' },
      shake:     { anim: 'shake',     emoji: '❌' },
      disagree:  { anim: 'shake',     emoji: '❌' },
      dance:     { anim: 'dance',     emoji: '💃' },
      celebrate: { anim: 'celebrate', emoji: '🎉' },
      clap:      { anim: 'celebrate', emoji: '🎉' },
      bow:       { anim: 'bow',       emoji: '🙇' },
      think:     { anim: 'think',     emoji: '🤔' },
      point:     { anim: 'point',     emoji: '👉' },
      sad:       { anim: 'sad',       emoji: '😢' },
      talk:      { anim: 'talk',      emoji: '🗣️' },
      speak:     { anim: 'talk',      emoji: '🗣️' },
      idle:      { anim: 'idle',      emoji: '😐' },
      rest:      { anim: 'idle',      emoji: '😐' }
    };

    // ✅ Initialize
    this._preloadVoices();
    this._checkTTS();
    this._loadHistory();
    this._bindUI();
    this._waitForInteraction();
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
        console.log('✅ Zira voice preloaded:', zira.name);
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
    console.log('Checking TTS server...');
    try {
      const response = await fetch('http://localhost:8000/health');
      const data     = await response.json();
      console.log('TTS health:', data);

      if (data.status === 'ok') {
        this.ttsReady = true;
        console.log('✅ TTS ready:', data.model);
      } else {
        this.ttsReady = false;
        console.warn('⚠️ TTS not ready');
      }
    } catch (e) {
      this.ttsReady = false;
      console.warn('⚠️ TTS not available - using browser TTS');
      console.error('TTS error:', e.name, e.message);
    }
  }

  // ==================================================
  //  INTERACTION UNLOCK
  // ==================================================

  _waitForInteraction() {
    console.log('Waiting for user interaction...');
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];

    const onInteraction = () => {
      console.log('User interaction detected');
      events.forEach(e => document.removeEventListener(e, onInteraction));

      const overlay = document.getElementById('startOverlay');
      if (overlay) {
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.opacity    = '0';
        setTimeout(() => overlay.remove(), 500);
      }

      this._unlockAudio().then(() => {
        setTimeout(() => this._greetUser(), 500);
      });
    };

    events.forEach(e => document.addEventListener(e, onInteraction, { once: false }));
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
  //  LOCAL STORAGE
  // ==================================================

  _saveHistory() {
    try {
      const data = {
        history:  this.chatHistory,
        userInfo: this.userInfo,
        savedAt:  new Date().toISOString()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      console.log('History saved:', this.chatHistory.length, 'messages');
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  }

  _loadHistory() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      console.log('Loading history:', raw ? 'YES' : 'NO');

      if (!raw) {
        this.userInfo.visitCount = 0;
        this.userInfo.lastVisit  = null;
        return;
      }

      const data       = JSON.parse(raw);
      this.chatHistory = (data.history || []).slice(-this.maxHistory);
      this.userInfo    = {
        name:       data.userInfo?.name       || null,
        lastVisit:  data.userInfo?.lastVisit  || null,
        visitCount: data.userInfo?.visitCount || 0,
      };

      this.userInfo.visitCount += 1;
      this.userInfo.lastVisit   = data.savedAt;

      console.log('History loaded:', this.chatHistory.length, 'messages');
      console.log('User name:', this.userInfo.name);
      console.log('Visit count:', this.userInfo.visitCount);

    } catch (e) {
      console.error('Failed to load history:', e);
      this.chatHistory = [];
    }
  }

  _clearHistory() {
    this.chatHistory         = [];
    this.userInfo.name       = null;
    this.userInfo.visitCount = 0;
    localStorage.removeItem(this.storageKey);
    console.log('History cleared');
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

    // ✅ Animations button
    const animBtn       = document.createElement('button');
    animBtn.id          = 'animBtn';
    animBtn.textContent = '🎭';
    animBtn.title       = 'Show animations';
    animBtn.addEventListener('click', () => this._toggleAnimDropdown());
    aiUi.appendChild(animBtn);

    // ✅ History button
    const historyBtn       = document.createElement('button');
    historyBtn.id          = 'historyBtn';
    historyBtn.textContent = '💬';
    historyBtn.title       = 'Show chat history';
    historyBtn.addEventListener('click', () => this._toggleHistoryPanel());
    aiUi.appendChild(historyBtn);

    // ✅ Clear button
    const clearBtn       = document.createElement('button');
    clearBtn.id          = 'clearBtn';
    clearBtn.textContent = '🗑️';
    clearBtn.title       = 'Clear chat history';
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all chat history with Luna?')) {
        this._clearHistory();
      }
    });
    aiUi.appendChild(clearBtn);

    // ✅ History panel
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
    header.textContent = '💕 Chat with Luna';
    panel.appendChild(header);

    const messages  = document.createElement('div');
    messages.id     = 'historyMessages';
    panel.appendChild(messages);
    document.body.appendChild(panel);

    this._updateHistoryPanel();

    // ✅ Close panels when clicking outside
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
    if (!messages) return;
    messages.innerHTML = '';

    if (this.chatHistory.length === 0) {
      messages.innerHTML = `
        <div style="
          color: #ff69b4;
          text-align: center;
          font-size: 13px;
          font-family: sans-serif;
        ">
          No messages yet, say hi to Luna! 💕
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
          ${isUser ? '👤 You' : '💕 Luna'}:
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
    el.textContent = `💬 ${count} message${count > 1 ? 's' : ''} queued`;
    document.body.appendChild(el);
  }

  _updateQueueIndicator(count) {
    const el = document.getElementById('queueIndicator');
    if (!el) return;
    if (count === 0) {
      this._removeQueuedIndicator();
    } else {
      el.textContent = `💬 ${count} message${count > 1 ? 's' : ''} queued`;
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
    console.log('Generating greeting...');
    console.log('Visit count:', this.userInfo.visitCount);
    console.log('User name:', this.userInfo.name);

    const greetingPrompt = this._buildGreetingPrompt();
    const thinkBubble    = this._showThinkingBubble();
    const greeting       = await this._askOllamaGreeting(greetingPrompt);

    thinkBubble.remove();

    console.log('Greeting:', greeting);

    this._saveHistory();
    this._executeGreeting(greeting);
  }

  _buildGreetingPrompt() {
    // ✅ First visit
    if (!this.userInfo.lastVisit || this.userInfo.visitCount <= 1) {
      return `Generate a warm and friendly greeting as Luna meeting someone for the first time.
      Ask for their name naturally.
      Maximum 1 sentence, maximum 20 words.
      Be sweet but not overly affectionate.`;
    }

    // ✅ Build context
    let context = '';

    if (this.userInfo.name) {
      context += `The user's name is ${this.userInfo.name}. `;
    }

    context += `They have visited ${this.userInfo.visitCount} times. `;

    // ✅ Time since last visit
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

    // ✅ Last few messages
    if (this.chatHistory.length > 0) {
      const recent = this.chatHistory.slice(-4);
      context     += `\nYour last conversation:\n`;
      recent.forEach(msg => {
        const role  = msg.role === 'user' ? 'User' : 'Luna';
        context    += `${role}: ${msg.content}\n`;
      });
    }

    return `Generate a warm returning greeting as Luna for someone you know.
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
    console.log('Asking Ollama for greeting...');

    try {
      const response = await fetch(this.ollamaUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:    this.ollamaModel,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user',   content: prompt            }
          ],
          stream:  false,
          options: {
            temperature: 0.8,
            num_predict: 50,
            stop:        ['.', '!', '?']
          }
        })
      });

      if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

      const data = await response.json();
      let text   = data.message?.content?.trim() || '';

      console.log('Raw greeting:', text);
      text = this._cleanResponse(text);
      console.log('Cleaned greeting:', text);

      return text || this._fallbackGreeting();

    } catch (error) {
      console.error('Greeting error:', error.message);
      return this._fallbackGreeting();
    }
  }

  _fallbackGreeting() {
    if (!this.userInfo.lastVisit || this.userInfo.visitCount <= 1) {
      return "Hi there! I am Luna, so happy to meet you!";
    }
    if (this.userInfo.name) {
      return `Welcome back ${this.userInfo.name}, I missed you!`;
    }
    return "Welcome back, I am so happy to see you again!";
  }

  async _executeGreeting(responseText) {
    if (this.isSpeaking || this.isProcessing) return;
    this.isSpeaking = true;

    console.log('Speaking greeting:', responseText);

    const bubble = this._showSpeechBubble(responseText);

    this.animController.playAnimation('wave', {
      loop:         this.LOOP_ONCE,
      returnToIdle: true
    });

    this.animController.startHeadBob(0.8);

    const duration = await this._speak(responseText);
    this.lipSync.startFromText(responseText, duration);

    await new Promise(resolve => setTimeout(resolve, duration + 200));

    this.lipSync.stop();
    this.animController.stopHeadBob();
    bubble.remove();
    this.isSpeaking = false;

    // ✅ Process any queued messages
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
    console.log('Queued:', text, '| Queue:', this.messageQueue.length);

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
      console.log('Processing:', text, '| Remaining:', this.messageQueue.length);
      this._updateQueueIndicator(this.messageQueue.length);
      await this._handleMessage(text);
    }

    this.isProcessing = false;
    this._removeQueuedIndicator();
  }

  async _handleMessage(text) {
    const lower  = text.toLowerCase();
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
  }

  // ==================================================
  //  STREAMING HANDLER
  // ==================================================

  async _handleMessageStreaming(intent, text) {
    console.log('Using streaming mode');

    const thinkBubble = this._showThinkingBubble();
    let   firstChunk  = true;
    let   bubble      = null;
    let   fullText    = '';

    const messages = [
      { role: 'system', content: this._buildSystemPrompt() },
      ...this.chatHistory.slice(-this.maxHistory)
    ];

    try {
      const response = await fetch(this.kokoroUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ollama_url: this.ollamaUrl,
          messages:   messages,
          model:      this.ollamaModel,
          voice:      this.ttsVoice,
          speed:      1.0,
        })
      });

      if (!response.ok) throw new Error(`Stream error: ${response.status}`);

      const reader     = response.body.getReader();
      let   remainder  = new Uint8Array(0);
      const audioQueue = [];
      let   isPlaying  = false;

      // ✅ Audio player
      const playNext = async () => {
        if (isPlaying || audioQueue.length === 0) return;
        isPlaying = true;

        const { sentence, audioBytes } = audioQueue.shift();

        if (bubble) bubble.textContent = fullText;

        const blob  = new Blob([audioBytes], { type: 'audio/wav' });
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);

        await new Promise((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          audio.play();
        });

        isPlaying = false;
        playNext();
      };

      // ✅ Read stream chunks
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
          const headerText  = new TextDecoder().decode(headerBytes);

          let header;
          try {
            header = JSON.parse(headerText);
          } catch (e) {
            offset = newlineIdx + 1;
            continue;
          }

          if (header.done) {
            console.log('Stream complete');
            offset = newlineIdx + 1;
            break;
          }

          const audioStart = newlineIdx + 1;
          const audioEnd   = audioStart + header.audio_size;

          if (audioEnd > combined.length) {
            remainder = combined.slice(offset);
            break;
          }

          const audioBytes = combined.slice(audioStart, audioEnd);
          offset           = audioEnd;
          remainder        = new Uint8Array(0);

          // ✅ First chunk setup
          if (firstChunk) {
            thinkBubble.remove();
            firstChunk = false;
            fullText   = header.sentence;
            bubble     = this._showSpeechBubble(fullText);

            this.animController.playAnimation(intent.anim, {
              loop:         this.LOOP_ONCE,
              returnToIdle: true
            });
            this.animController.startHeadBob(0.8);
          } else {
            fullText += ' ' + header.sentence;
          }

          console.log('Received sentence:', header.sentence);
          audioQueue.push({ sentence: header.sentence, audioBytes });
          playNext();
        }
      }

      // ✅ Wait for all audio to finish
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (!isPlaying && audioQueue.length === 0) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });

      if (fullText) {
        this._addToHistory('assistant', fullText);
      }

    } catch (e) {
      console.error('Streaming error:', e);
      thinkBubble.remove();
      await this._handleMessageStandard(intent, text);
      return;
    }

    if (bubble) bubble.remove();
    this.animController.stopHeadBob();
    this.isSpeaking = false;
  }

  // ==================================================
  //  STANDARD HANDLER
  // ==================================================

  async _handleMessageStandard(intent, text) {
    console.log('Using standard mode');

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
    console.log('History length:', this.chatHistory.length);
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
        this.userInfo.name = match[1];
        console.log('Learned name:', this.userInfo.name);
        this._saveHistory();
        break;
      }
    }
  }

  _detectIntent(text) {
    for (const [keyword, data] of Object.entries(this.intentMap)) {
      if (text.includes(keyword)) return { keyword, ...data };
    }
    return { keyword: 'talk', anim: 'talk', emoji: '🗣️' };
  }

  // ==================================================
  //  OLLAMA
  // ==================================================

  async _askOllama(userText) {
    console.log('Asking Ollama:', userText);

    try {
      const messages = [
        { role: 'system', content: this._buildSystemPrompt() },
        ...this.chatHistory.slice(-this.maxHistory)
      ];

      const response = await fetch(this.ollamaUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:    this.ollamaModel,
          messages: messages,
          stream:   false,
          options: {
            temperature: 0.7,
            num_predict: 50,
            stop:        ['.', '!', '?']
          }
        })
      });

      if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

      const data = await response.json();
      let text   = data.message?.content?.trim() || '';

      console.log('Raw response:', text);
      text = this._cleanResponse(text);
      console.log('Cleaned response:', text);

      return text || 'I am not sure how to respond to that.';

    } catch (error) {
      console.error('Ollama error:', error.message);
      return this._fallbackResponse(error);
    }
  }

  _buildSystemPrompt() {
    let prompt = this.systemPrompt;

    if (this.userInfo.name) {
      prompt += `\nThe user's name is ${this.userInfo.name}. Use their name naturally but not in every message.`;
    }

    if (this.userInfo.visitCount > 1) {
      prompt += `\nThis person has visited ${this.userInfo.visitCount} times before.`;
    }

    // ✅ Limit endearment usage
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

    // ✅ Remove markdown
    text = text.replace(/\*\*/g, '');
    text = text.replace(/\*/g, '');
    text = text.replace(/#{1,6}\s/g, '');
    text = text.replace(/`/g, '');

    // ✅ Take only first sentence
    const sentenceEnd = text.search(/[.!?]/);
    if (sentenceEnd !== -1) {
      text = text.substring(0, sentenceEnd + 1);
    }

    text = text.trim();

    // ✅ Ensure ends with punctuation
    if (text && !text.match(/[.!?]$/)) {
      text = text + '.';
    }

    return text;
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

    this.animController.startHeadBob(0.8);

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
    console.log('ttsReady:', this.ttsReady);

    if (this.ttsReady) {
      console.log('Using Kokoro TTS');
      return this._speakWithKokoro(text);
    } else {
      console.log('Using browser TTS');
      return this._speakWithBrowser(text);
    }
  }

  async _speakWithKokoro(text) {
    try {
      const cleanText = this._cleanTextForTTS(text);
      console.log('Kokoro generating:', cleanText.substring(0, 50));

      const start    = Date.now();
      const response = await fetch(this.ttsUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text:  cleanText,
          voice: this.ttsVoice,
          speed: 1.0,
        })
      });

      if (!response.ok) throw new Error(`Kokoro error: ${response.status}`);

      const blob  = await response.blob();
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);

      return new Promise((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          console.log('Kokoro speech finished');
          resolve(Date.now() - start);
        };
        audio.onerror = (e) => {
          console.error('Kokoro audio error:', e);
          URL.revokeObjectURL(url);
          resolve(this._speakWithBrowser(text));
        };
        audio.play();
      });

    } catch (e) {
      console.error('Kokoro speak error:', e);
      return this._speakWithBrowser(text);
    }
  }

  _cleanTextForTTS(text) {
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

  _speakWithBrowser(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve(text.length * 60);
        return;
      }

      speechSynthesis.cancel();

      const utter   = new SpeechSynthesisUtterance(text);
      utter.rate    = 0.90;
      utter.pitch   = 1.1;
      utter.volume  = 1;

      if (this.ziraVoice) {
        utter.voice = this.ziraVoice;
      } else {
        const voices = speechSynthesis.getVoices();
        const zira   = voices.find(v => v.name.includes('Zira'));
        if (zira) {
          utter.voice    = zira;
          this.ziraVoice = zira;
        }
      }

      const start    = Date.now();
      utter.onstart  = () => console.log('Browser TTS speaking...');
      utter.onend    = () => resolve(Date.now() - start);
      utter.onerror  = (e) => {
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

  // ==================================================
  //  BUBBLES
  // ==================================================

  _showThinkingBubble() {
    this._ensureBubbleStyle();
    const bubble         = document.createElement('div');
    bubble.id            = 'thinking-bubble';
    bubble.style.cssText = this._bubbleStyle();
    bubble.innerHTML     = '💭 Luna is thinking...';
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