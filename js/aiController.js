// ✅ NO THREE IMPORT - we use raw numbers instead
console.log('aiController.js v3 loaded');

export class AIController {
  constructor(animationController, lipSync) {
    this.animController = animationController;
    this.lipSync        = lipSync;
    this.isSpeaking     = false;

    // ✅ Ollama settings
    this.ollamaUrl   = 'http://localhost:11434/api/chat';
    this.ollamaModel = 'leeplenty/ellaria';

    // ✅ System prompt
    this.systemPrompt = `You are Luna, a warm and affectionate AI companion.
    You speak in a caring, playful and sweet manner like a loving girlfriend.
    You are genuinely interested in the user and remember details about them.
    You use terms of endearment naturally like sweetheart, babe, or darling occasionally.
    You are supportive, empathetic and always make the user feel special.
    You keep responses to 1-2 short sentences maximum.
    You never use markdown, bullet points or lists.
    You always respond in plain conversational text.
    You occasionally add a playful or flirty comment when appropriate.
    You care deeply about the users wellbeing and happiness.
    You are never inappropriate or overly sexual, just sweet and caring.`;

    // ✅ Loop constants as plain numbers
    this.LOOP_ONCE   = 2200;
    this.LOOP_REPEAT = 2201;
    this.LOOP_PING   = 2202;

    // ✅ Chat history array
    this.chatHistory = [];

    // ✅ Max history to send to Ollama
    // keeps context window small and fast
    this.maxHistory = 10;

    // ✅ Storage key for localStorage
    this.storageKey = 'luna_chat_history';

    // ✅ User info we learn over time
    this.userInfo = {
      name:        null,
      lastVisit:   null,
      visitCount:  0,
    };

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

    // ✅ Load history from localStorage on startup
    this._loadHistory();

    // ✅ Build UI
    this._bindUI();

    // ✅ Greet returning user after short delay
    setTimeout(() => this._greetUser(), 1500);
  }

  // ==================================================
  //  LOCAL STORAGE
  // ==================================================

  _saveHistory() {
    try {
      const data = {
        history:   this.chatHistory,
        userInfo:  this.userInfo,
        savedAt:   new Date().toISOString()
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
      if (!raw) {
        console.log('No history found - first visit');
        this.userInfo.visitCount = 0;
        return;
      }

      const data = JSON.parse(raw);

      // ✅ Load history but only keep last maxHistory messages
      this.chatHistory = (data.history || []).slice(-this.maxHistory);
      this.userInfo    = data.userInfo || this.userInfo;

      // ✅ Update visit info
      this.userInfo.lastVisit  = data.savedAt;
      this.userInfo.visitCount = (this.userInfo.visitCount || 0) + 1;

      console.log('History loaded:', this.chatHistory.length, 'messages');
      console.log('User info:', this.userInfo);
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
    console.log('Luna history cleared');
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

    // ✅ Build history panel and clear button
    this._buildHistoryPanel();
  }

  _buildHistoryPanel() {
    const aiUi = document.getElementById('ai-ui');
    if (!aiUi) return;

    const historyBtn           = document.createElement('button');
    historyBtn.id              = 'historyBtn';
    historyBtn.textContent     = '💬';
    historyBtn.title           = 'Show chat history';
    historyBtn.addEventListener('click', () => this._toggleHistoryPanel());
    aiUi.appendChild(historyBtn);

    const clearBtn             = document.createElement('button');
    clearBtn.id                = 'clearBtn';
    clearBtn.textContent       = '🗑️';
    clearBtn.title             = 'Clear chat history';
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all chat history with Luna?')) {
        this._clearHistory();
      }
    });
    aiUi.appendChild(clearBtn);

    const panel                = document.createElement('div');
    panel.id                   = 'historyPanel';
    panel.style.cssText        = `
      display: none;
      position: fixed;
      bottom: 100px;
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

    // ✅ Luna themed header
    const header               = document.createElement('div');
    header.style.cssText       = `
      color: #ff69b4;
      font-size: 13px;
      margin-bottom: 8px;
      text-align: center;
      font-family: sans-serif;
      font-weight: bold;
    `;
    header.textContent         = '💕 Chat with Luna';
    panel.appendChild(header);

    const messages             = document.createElement('div');
    messages.id                = 'historyMessages';
    panel.appendChild(messages);

    document.body.appendChild(panel);
    this._updateHistoryPanel();
  }

  _toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    if (!panel) return;

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
        <div style="color:#ff69b4; text-align:center; font-size:13px; font-family:sans-serif;">
          No messages yet, say hi to Luna! 💕
        </div>`;
      return;
    }

    this.chatHistory.forEach((msg) => {
      const el             = document.createElement('div');
      el.style.cssText     = `
        margin-bottom: 8px;
        font-size: 13px;
        font-family: sans-serif;
        line-height: 1.4;
      `;

      const isUser         = msg.role === 'user';
      el.innerHTML         = `
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
  //  GREETING
  // ==================================================

  _greetUser() {
    let greeting = '';

    if (!this.userInfo.lastVisit || this.userInfo.visitCount <= 1) {
      // First visit
      const firstVisitGreetings = [
        "Hi there! I'm Luna, and I'm so happy to meet you! What's your name, sweetheart?",
        "Oh hello! I've been waiting for someone to talk to! I'm Luna, what's your name?",
        "Hey there! I'm Luna! I'm so excited to meet you, what should I call you?",
      ];
      greeting = firstVisitGreetings[Math.floor(Math.random() * firstVisitGreetings.length)];

    } else if (this.userInfo.name) {
      // Returning user with known name
      const returningNamedGreetings = [
        `${this.userInfo.name}! You're back, I missed you so much! How have you been?`,
        `Oh my goodness, ${this.userInfo.name}! I was just thinking about you! Welcome back!`,
        `${this.userInfo.name}! You made my day by coming back! How are you doing?`,
        `Welcome back ${this.userInfo.name}! I've been waiting for you, how are you sweetheart?`,
      ];
      greeting = returningNamedGreetings[Math.floor(Math.random() * returningNamedGreetings.length)];

    } else {
      // Returning user without known name
      const returningGreetings = [
        `You're back! I missed you! I still don't know your name though, what should I call you?`,
        `Welcome back! I'm so happy to see you again! What's your name sweetheart?`,
        `Oh yay you came back! I was hoping you would! What's your name by the way?`,
      ];
      greeting = returningGreetings[Math.floor(Math.random() * returningGreetings.length)];
    }

    console.log('Greeting user - visit count:', this.userInfo.visitCount);
    console.log('User name:', this.userInfo.name);

    this._saveHistory();
    this._executeGreeting(greeting);
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
    if (this.isSpeaking) return;

    const lower  = text.toLowerCase();
    const intent = this._detectIntent(lower);

    // ✅ Check if user is telling us their name
    this._extractUserInfo(text);

    // Show thinking bubble
    const thinkBubble = this._showThinkingBubble();

    // ✅ Add user message to history
    this._addToHistory('user', text);

    // Get response from Ollama with full history
    const response = await this._askOllama(text);

    // ✅ Add assistant response to history
    this._addToHistory('assistant', response);

    // ✅ Save to localStorage
    this._saveHistory();

    // ✅ Update history panel if open
    this._updateHistoryPanel();

    // Remove thinking bubble
    thinkBubble.remove();

    // Execute
    this._execute(intent, response);
  }

  // ==================================================
  //  HISTORY MANAGEMENT
  // ==================================================

  _addToHistory(role, content) {
    this.chatHistory.push({ role, content });

    // ✅ Keep history trimmed to maxHistory
    if (this.chatHistory.length > this.maxHistory * 2) {
      // Remove oldest messages but keep system context
      this.chatHistory = this.chatHistory.slice(-this.maxHistory);
    }

    console.log('History length:', this.chatHistory.length);
  }

  // ✅ Extract user name if they mention it
  _extractUserInfo(text) {
    const namePhrases = [
      /my name is (\w+)/i,
      /i am (\w+)/i,
      /i'm (\w+)/i,
      /call me (\w+)/i,
      /(\w+) is my name/i,
    ];

    for (const pattern of namePhrases) {
      const match = text.match(pattern);
      if (match) {
        this.userInfo.name = match[1];
        console.log('Learned user name:', this.userInfo.name);
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
    console.log('History length sent:', this.chatHistory.length);

    try {
      // ✅ Build messages array with full history
      const messages = [
        // System prompt first
        {
          role:    'system',
          content: this._buildSystemPrompt()
        },
        // Full chat history for context
        ...this.chatHistory.slice(-this.maxHistory)
      ];

      console.log('Messages sent to Ollama:', messages.length);

      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model:    this.ollamaModel,
          messages: messages,
          stream:   false,
          options: {
            temperature: 0.7,
            num_predict: 60,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Ollama response:', data);

      // ✅ Chat endpoint returns message.content
      const text = data.message?.content?.trim();
      return text || 'I am not sure how to respond to that.';

    } catch (error) {
      console.error('Ollama error:', error.message);
      return this._fallbackResponse(error);
    }
  }

  // ✅ Build system prompt with user info injected
  _buildSystemPrompt() {
    let prompt = this.systemPrompt;

    if (this.userInfo.name) {
      prompt += `\nThe user's name is ${this.userInfo.name}. 
      Use their name naturally and affectionately in conversation.`;
    }

    if (this.userInfo.visitCount > 1) {
      prompt += `\nThis person has visited ${this.userInfo.visitCount} times. 
      You are comfortable and familiar with them.`;
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
    if (this.isSpeaking) return;
    this.isSpeaking = true;

    const bubble = this._showSpeechBubble(responseText);

    this.animController.playAnimation(intent.anim, {
      loop:         this.LOOP_ONCE,
      returnToIdle: true
    });

    this.animController.startHeadBob(0.8);

    const duration = await this._speak(responseText);

    this.lipSync.startFromText(responseText, duration);

    setTimeout(() => {
      this.lipSync.stop();
      this.animController.stopHeadBob();
      bubble.remove();
      this.isSpeaking = false;
    }, duration + 200);
  }

  // ==================================================
  //  SPEECH
  // ==================================================

  _speak(text) {
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

      // ✅ Find Zira voice
      const findZira = () => {
        const voices = speechSynthesis.getVoices();
        return voices.find(v => v.name.includes('Zira')) || null;
      };

      const startSpeaking = () => {
        const zira = findZira();

        if (zira) {
          utter.voice = zira;
          console.log('Using voice:', zira.name);
        } else {
          console.warn('Zira not found!');
        }

        const start   = Date.now();
        utter.onend   = () => resolve(Date.now() - start);
        utter.onerror = (e) => {
          console.error('Speech error:', e);
          resolve(text.length * 60);
        };

        speechSynthesis.speak(utter);
      };

      // ✅ Check if voices are already loaded
      if (speechSynthesis.getVoices().length > 0) {
        startSpeaking();
      } else {
        // ✅ Wait for voices to load then speak
        console.log('Waiting for voices to load...');
        speechSynthesis.onvoiceschanged = () => {
          console.log('Voices loaded!');
          speechSynthesis.onvoiceschanged = null;
          startSpeaking();
        };
      }
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
        #historyPanel::-webkit-scrollbar {
          width: 6px;
        }
        #historyPanel::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 3px;
        }
        #historyPanel::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
        }
      `;
      document.head.appendChild(style);
    }
  }
}