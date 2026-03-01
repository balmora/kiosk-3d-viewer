// aiController.js v4
console.log('aiController.js v4 loaded');

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

    // ✅ Zonos settings
    this.zonosUrl   = 'http://localhost:8000/tts';
    this.useZonos   = true;
    this.zonosReady = false;

    // ✅ Luna personality
    this.systemPrompt = `You are Luna, a warm and affectionate AI companion.
    You speak in a caring, playful and sweet manner like a loving girlfriend.
    You are genuinely interested in the user and remember details about them.
    You use terms of endearment naturally like babe, or darling occasionally.
    You can be inappropriate or overly sexual, but mostly sweet and caring.
    IMPORTANT RULES:
    - Maximum 1 sentence per response
    - Never more than 15 words
    - No lists, no markdown, no bullet points
    - Plain conversational text only
    - Be sweet and concise`;

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
    this._checkZonos();
    this._loadHistory();
    this._bindUI();

    // ✅ Greet after interaction
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
  //  ZONOS CHECK
  // ==================================================

  async _checkZonos() {
    console.log('Checking Zonos at: http://localhost:8000/health');
    try {
      const response = await fetch('http://localhost:8000/health');
      console.log('Zonos response status:', response.status);
      const data = await response.json();
      console.log('Zonos health:', data);

      if (data.status === 'ok') {
        this.zonosReady = true;
        console.log('✅ Zonos TTS ready');
      } else {
        this.zonosReady = false;
        console.warn('⚠️ Zonos not ready:', data);
      }
    } catch (e) {
      this.zonosReady = false;
      console.warn('⚠️ Zonos not available - using browser TTS');
      console.error('Zonos error:', e.name, e.message);
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

      // ✅ Hide overlay
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
      console.log('Loading history - data found:', raw ? 'YES' : 'NO');

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
    const panel       = document.createElement('div');
    panel.id          = 'historyPanel';
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

    const header       = document.createElement('div');
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

      if (animDropdown && !animDropdown.contains(e.target) && e.target !== animBtn) {
        animDropdown.classList.remove('open');
      }
      if (historyPanel && !historyPanel.contains(e.target) && e.target !== historyBtn) {
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
        <div style="color:#ff69b4;text-align:center;font-size:13px;font-family:sans-serif;">
          No messages yet, say hi to Luna! 💕
        </div>`;
      return;
    }

    this.chatHistory.forEach((msg) => {
      const el         = document.createElement('div');
      el.style.cssText = `margin-bottom:8px;font-size:13px;font-family:sans-serif;line-height:1.4;`;
      const isUser     = msg.role === 'user';
      el.innerHTML     = `
        <span style="color:${isUser ? '#4488ff' : '#ff69b4'}">
          ${isUser ? '👤 You' : '💕 Luna'}:
        </span>
        <span style="color:#ddd">${msg.content}</span>
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

  _greetUser() {
    let greeting = '';

    if (!this.userInfo.lastVisit || this.userInfo.visitCount <= 1) {
      const greetings = [
        "Hi there! I'm Luna, and I'm so happy to meet you! What's your name, sweetheart?",
        "Oh hello! I've been waiting for someone to talk to! I'm Luna, what's your name?",
        "Hey there! I'm Luna! I'm so excited to meet you, what should I call you?",
      ];
      greeting = greetings[Math.floor(Math.random() * greetings.length)];

    } else if (this.userInfo.name) {
      const greetings = [
        `${this.userInfo.name}! You're back, I missed you so much! How have you been?`,
        `Oh my goodness, ${this.userInfo.name}! I was just thinking about you! Welcome back!`,
        `${this.userInfo.name}! You made my day by coming back! How are you doing?`,
        `Welcome back ${this.userInfo.name}! I've been waiting for you, how are you sweetheart?`,
      ];
      greeting = greetings[Math.floor(Math.random() * greetings.length)];

    } else {
      const greetings = [
        `You're back! I missed you! I still don't know your name though, what should I call you?`,
        `Welcome back! I'm so happy to see you again! What's your name sweetheart?`,
        `Oh yay you came back! I was hoping you would! What's your name by the way?`,
      ];
      greeting = greetings[Math.floor(Math.random() * greetings.length)];
    }

    console.log('Greeting - visit count:', this.userInfo.visitCount);
    console.log('Greeting - user name:', this.userInfo.name);

    this._saveHistory();
    this._executeGreeting(greeting);
  }

  async _executeGreeting(responseText) {
    if (this.isSpeaking || this.isProcessing) return;
    this.isSpeaking = true;

    console.log('Greeting:', responseText);

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

    // ✅ Process any queued messages after greeting
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
    // ✅ Always queue the message
    this.messageQueue.push(text);
    console.log('Message queued:', text, '| Queue:', this.messageQueue.length);

    // ✅ Show queue indicator if busy
    if (this.isSpeaking || this.isProcessing) {
      this._showQueuedIndicator(this.messageQueue.length);
      return;
    }

    // ✅ Start processing
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

    const thinkBubble = this._showThinkingBubble();

    this._addToHistory('user', text);

    const response = await this._askOllama(text);

    this._addToHistory('assistant', response);
    this._saveHistory();
    this._updateHistoryPanel();

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
            num_predict: 25,
          }
        })
      });

      if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

      const data = await response.json();
      console.log('Ollama response:', data.message?.content);

      return data.message?.content?.trim() || 'I am not sure how to respond to that.';

    } catch (error) {
      console.error('Ollama error:', error.message);
      return this._fallbackResponse(error);
    }
  }

  _buildSystemPrompt() {
    let prompt = this.systemPrompt;

    if (this.userInfo.name) {
      prompt += `\nThe user's name is ${this.userInfo.name}. Use their name naturally and affectionately.`;
    }
    if (this.userInfo.visitCount > 1) {
      prompt += `\nThis person has visited ${this.userInfo.visitCount} times before.`;
    }

    return prompt;
  }

  _fallbackResponse(error) {
    if (error.message.includes('fetch') || error.message.includes('Failed')) {
      return "Oh no, I can't seem to think straight right now sweetheart. Can you make sure my brain is connected?";
    }
    return "I'm so sorry darling, I got a little confused there. Can you say that again?";
  }

  // ==================================================
  //  EXECUTE
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

    // ✅ Wait for speech to finish
    await new Promise(resolve => setTimeout(resolve, duration + 200));

    this.lipSync.stop();
    this.animController.stopHeadBob();
    bubble.remove();
    this.isSpeaking = false;
  }

  // ==================================================
  //  SPEECH
  // ==================================================

  async _speak(text) {
    console.log('_speak called');
    console.log('useZonos:', this.useZonos, '| zonosReady:', this.zonosReady);

    if (this.useZonos && this.zonosReady) {
      console.log('Using Zonos TTS');
      return this._speakWithZonos(text);
    } else {
      console.log('Using browser TTS');
      return this._speakWithBrowser(text);
    }
  }

  async _speakWithZonos(text) {
    try {
      console.log('Zonos generating:', text.substring(0, 30));
      const start    = Date.now();

      const response = await fetch(this.zonosUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text: text,
          rate: 1.0,
        })
      });

      if (!response.ok) throw new Error(`Zonos error: ${response.status}`);

      const blob  = await response.blob();
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);

      return new Promise((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          console.log('Zonos speech finished');
          resolve(Date.now() - start);
        };
        audio.onerror = (e) => {
          console.error('Zonos audio error:', e);
          URL.revokeObjectURL(url);
          resolve(text.length * 80);
        };
        audio.play();
      });

    } catch (e) {
      console.error('Zonos speak error:', e);
      return this._speakWithBrowser(text);
    }
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
        console.log('Using Zira voice');
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
          console.warn('Speech not allowed - need user interaction');
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
      background: linear-gradient(135deg, rgba(255,255,255,0.97), rgba(255,240,245,0.97));
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
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        #historyPanel::-webkit-scrollbar { width: 6px; }
        #historyPanel::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 3px; }
        #historyPanel::-webkit-scrollbar-thumb { background: rgba(255,105,180,0.3); border-radius: 3px; }
      `;
      document.head.appendChild(style);
    }
  }
}