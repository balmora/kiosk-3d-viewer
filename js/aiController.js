export class AIController {
  constructor(animationController, lipSync) {
    this.animController = animationController;
    this.lipSync        = lipSync;
    this.isSpeaking     = false;

    // ✅ Ollama settings
    this.ollamaUrl   = 'http://localhost:11434/api/generate';
    this.ollamaModel = 'leeplenty/ellaria'; // change to match your pulled model

    // ✅ System prompt — keeps responses short and kiosk friendly
    this.systemPrompt = `You are a friendly kiosk assistant avatar. 
    Keep all responses to 1-2 short sentences maximum.
    Be helpful, friendly and concise.
    Never use markdown, bullet points or lists.
    Always respond in plain conversational text.`;

    // ✅ THREE loop constants as raw numbers
    this.LOOP_ONCE    = 2200;
    this.LOOP_REPEAT  = 2201;
    this.LOOP_PING    = 2202;

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

    this._bindUI();
  }

  _bindUI() {
    const sendBtn = document.getElementById('aiSend');
    const input   = document.getElementById('aiPrompt');

    sendBtn?.addEventListener('click', () => this._handleInput(input));
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleInput(input);
    });
  }

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

    // ✅ Show thinking bubble while waiting for Ollama
    const thinkBubble = this._showThinkingBubble();

    // ✅ Get response from Ollama
    const response = await this._askOllama(text);

    // ✅ Remove thinking bubble
    thinkBubble.remove();

    // ✅ Execute with real AI response
    this._execute(intent, response);
  }

  _detectIntent(text) {
    for (const [keyword, data] of Object.entries(this.intentMap)) {
      if (text.includes(keyword)) return { keyword, ...data };
    }
    return { keyword: 'talk', anim: 'talk', emoji: '🗣️' };
  }

  // ✅ Ask Ollama for a response
  async _askOllama(userText) {
    try {
      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model:  this.ollamaModel,
          system: this.systemPrompt,
          prompt: userText,
          stream: false,        // ✅ get full response at once
          options: {
            temperature: 0.7,   // ✅ creativity 0=robotic 1=creative
            num_predict: 60,    // ✅ max tokens = keeps it short
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.response?.trim();

      console.log('Ollama response:', text);
      return text || 'I am not sure how to respond to that.';

    } catch (error) {
      console.error('Ollama error:', error);
      return this._fallbackResponse(error);
    }
  }

  // ✅ Fallback if Ollama is not running
  _fallbackResponse(error) {
    if (error.message.includes('fetch')) {
      return 'I cannot connect to my AI brain right now. Please make sure Ollama is running.';
    }
    return 'Sorry, I had trouble thinking of a response just now.';
  }

  async _execute(intent, responseText) {
    if (this.isSpeaking) return;
    this.isSpeaking = true;

    // Show speech bubble
    const bubble = this._showSpeechBubble(responseText);

    // Trigger animation
    this.animController.playAnimation(intent.anim, {
      loop:         this.LOOP_ONCE,
      returnToIdle: true
    });

    // Head bob during speech
    this.animController.startHeadBob(0.8);

    // Speak and get duration
    const duration = await this._speak(responseText);

    // Lip sync
    this.lipSync.startFromText(responseText, duration);

    // Cleanup
    setTimeout(() => {
      this.lipSync.stop();
      this.animController.stopHeadBob();
      bubble.remove();
      this.isSpeaking = false;
    }, duration + 200);
  }

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

      const setVoice = () => {
        const voices = speechSynthesis.getVoices();

        // ✅ Set to Zira
        const zira = voices.find(v => v.name.includes('Zira'));

        if (zira) {
          utter.voice = zira;
          console.log('Using voice:', zira.name);
        } else {
          console.warn('Zira not found, available voices:');
          voices.forEach(v => console.log(v.name));
        }
      };

      if (speechSynthesis.getVoices().length > 0) {
        setVoice();
      } else {
        speechSynthesis.onvoiceschanged = setVoice;
      }

      const start   = Date.now();
      utter.onend   = () => resolve(Date.now() - start);
      utter.onerror = (e) => {
        console.error('Speech error:', e);
        resolve(text.length * 60);
      };

      speechSynthesis.speak(utter);
    });
  }

  // ✅ Thinking bubble while waiting for Ollama
  _showThinkingBubble() {
    this._ensureBubbleStyle();

    const bubble = document.createElement('div');
    bubble.id = 'thinking-bubble';
    bubble.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255,255,255,0.95);
      color: #111;
      padding: 14px 20px;
      border-radius: 16px;
      font-size: 16px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 100;
      animation: fadeIn 0.3s ease;
    `;
    bubble.innerHTML = '🤔 Thinking...';
    document.body.appendChild(bubble);
    return bubble;
  }

  _showSpeechBubble(text) {
    this._ensureBubbleStyle();

    const bubble = document.createElement('div');
    bubble.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255,255,255,0.95);
      color: #111;
      padding: 14px 20px;
      border-radius: 16px;
      font-size: 16px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 100;
      animation: fadeIn 0.3s ease;
    `;
    bubble.textContent = text;
    document.body.appendChild(bubble);
    return bubble;
  }

  _ensureBubbleStyle() {
    if (!document.getElementById('bubble-style')) {
      const style = document.createElement('style');
      style.id = 'bubble-style';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
  }
}