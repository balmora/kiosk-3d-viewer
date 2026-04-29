import { CONFIG } from './config.js?v=2';

/**
 * ChatMemory - Multi-profile persistent memory system with server storage
 * 
 * Storage Architecture:
 * - Server: SQLite via memory_server.py (port 8090)
 * - Local: Chat history cached in memory
 * 
 * Memory Scopes:
 * - 'model': Facts about the model/character (shared across all users)
 * - 'user': Facts about the user (private to this user)
 * 
 * Privacy Levels:
 * - 'private': Only visible within this user's profile
 * - 'shared': Visible to all users, attributed to source
 * - 'public': No attribution, visible to all
 */

export class ChatMemory {
  constructor(storageKey = 'luna_chat_history', maxHistory = 10) {
    this.storageKey = storageKey;
    this.maxHistory = maxHistory;
    this._aiController = null;
    this._characterName = null;
    this._useServer = CONFIG?.memory?.useServerStorage ?? true;
    this._serverAvailable = false;
    this._apiUrl = CONFIG?.memory?.apiUrl || 'http://localhost:8090';

    // Local state (not synced to server)
    this.chatHistory = [];
    this.messageCount = 0;

    // Server state
    this.currentUserId = null;
    this.currentUserName = null;
    this.currentModelId = null;
    this.currentSessionId = null;

    // User info
    this.userInfo = {
      name: null,
      lastVisit: null,
      visitCount: 0,
    };

    // Memories
    this.modelMemories = [];  // Shared memories about the model
    this.userMemories = [];   // Private memories about this user
    this.memorySummary = '';

    // Aliases for compatibility with aiController.js
    this.userFacts = [];       // Alias for userMemories
    this.characterFacts = [];  // Alias for modelMemories
  }

  setAI(aiController) {
    this._aiController = aiController;
  }

  setCharacterName(name) {
    this._characterName = name ? name.toLowerCase() : 'default';
    this.currentModelId = this._characterName;
  }

  setApiUrl(url) {
    url = url.replace(/\/+$/, '');
    this._apiUrl = url;
    localStorage.setItem('api_url', url);
    CONFIG.memory.apiUrl = url;
    console.log('[ChatMemory] API URL set to:', url);
  }

  getApiUrl() {
    return this._apiUrl;
  }

  // ============ Server Communication ============

  async _apiRequest(endpoint, options = {}) {
    const url = `${this._apiUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return await response.json();
    } catch (e) {
      console.warn('[ChatMemory] API request failed:', e.message);
      this._serverAvailable = false;
      throw e;
    }
  }

  async _checkServer() {
    try {
      await this._apiRequest('/api/ping');
      this._serverAvailable = true;
      console.log('[ChatMemory] Server connected:', this._apiUrl);
      return true;
    } catch (e) {
      this._serverAvailable = false;
      console.warn('[ChatMemory] Server not available');
      return false;
    }
  }

  // ============ Session Management ============

  async load() {
    // Check server connection
    await this._checkServer();

    if (!this._serverAvailable) {
      console.warn('[ChatMemory] Running without server - memories will not persist');
      return;
    }

    try {
      // Update visit info
      this.userInfo.visitCount += 1;
      this.userInfo.lastVisit = new Date().toISOString();

      // Start a session
      const session = await this._apiRequest('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: this.currentUserId,
          model_id: this.currentModelId
        })
      });
      this.currentSessionId = session.id;

      // Load model memories (shared)
      const modelMems = await this._apiRequest(
        `/api/memories/model?model_id=${this.currentModelId}`
      );
      this.modelMemories = modelMems;
      this.characterFacts = modelMems;

      // Load user memories if user is known
      if (this.currentUserId) {
        const userMems = await this._apiRequest(
          `/api/memories/user?user_id=${this.currentUserId}&model_id=${this.currentModelId}`
        );
        this.userMemories = userMems;
        this.userFacts = userMems;
        this.userMemories = userMems;
      }

      // Update session activity
      this._updateSessionActivity();

      console.log('[ChatMemory] Loaded:', this.modelMemories.length, 'model memories,', this.userMemories.length, 'user memories');
    } catch (e) {
      console.error('[ChatMemory] Load error:', e.message);
    }
  }

  async _updateSessionActivity() {
    if (!this.currentSessionId || !this._serverAvailable) return;
    try {
      await this._apiRequest(`/api/sessions/${this.currentSessionId}`, {
        method: 'PUT'
      });
    } catch (e) {
      // Silent fail for activity updates
    }
  }

  // ============ User Management ============

  async identifyUser(name) {
    if (!this._serverAvailable) {
      this.currentUserName = name;
      return;
    }

    try {
      // Try to get existing user
      let user;
      try {
        user = await this._apiRequest(`/api/users/name/${encodeURIComponent(name)}`);
      } catch (e) {
        // User not found, create new
        user = await this._apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify({ name })
        });
      }

      this.currentUserId = user.id;
      this.currentUserName = user.name;
      this.userInfo.name = user.name;

      console.log('[ChatMemory] User identified:', user.name, '(id:', user.id + ')');
    } catch (e) {
      console.error('[ChatMemory] User identification error:', e.message);
      this.currentUserName = name;
    }
  }

  getCurrentUserId() {
    return this.currentUserId;
  }

  getCurrentUserName() {
    return this.currentUserName;
  }

  // ============ Memory Management ============

  async addModelMemory(content, category = 'fact', confidence = 1.0) {
    if (!content || !this._serverAvailable) return;

    const memory = {
      type: 'model',
      model_id: this.currentModelId,
      category,
      content,
      confidence,
      source_user_id: this.currentUserId
    };

    try {
      const result = await this._apiRequest('/api/memories', {
        method: 'POST',
        body: JSON.stringify(memory)
      });

      // Add to local cache
      this.modelMemories.unshift({
        ...memory,
        id: result.id,
        type: 'model'
      });
      this.characterFacts = this.modelMemories;

      console.log('[ChatMemory] Added model memory:', content.substring(0, 50) + '...');
    } catch (e) {
      console.error('[ChatMemory] Failed to add model memory:', e.message);
    }
  }

  async addUserMemory(content, category = 'fact') {
    if (!content || !this._serverAvailable || !this.currentUserId) return;

    const memory = {
      type: 'user',
      user_id: this.currentUserId,
      model_id: this.currentModelId,
      category,
      content
    };

    try {
      const result = await this._apiRequest('/api/memories', {
        method: 'POST',
        body: JSON.stringify(memory)
      });

      // Add to local cache
      this.userMemories.unshift({
        ...memory,
        id: result.id,
        type: 'user'
      });
      this.userFacts = this.userMemories;

      console.log('[ChatMemory] Added user memory:', content.substring(0, 50) + '...');
    } catch (e) {
      console.error('[ChatMemory] Failed to add user memory:', e.message);
    }
  }

  getModelMemories() {
    return this.modelMemories || [];
  }

  getUserMemories() {
    return this.userMemories || [];
  }

  getAllMemoriesForPrompt() {
    const parts = [];

    // Model memories (shared facts)
    const modelFacts = this.modelMemories
      .filter(m => m.category === 'fact')
      .slice(0, 5)
      .map(m => m.content);

    if (modelFacts.length > 0) {
      parts.push('Facts about ' + (this._characterName || 'the character') + ':\n' + modelFacts.map(f => '- ' + f).join('\n'));
    }

    // User memories (user facts)
    const userFacts = this.userMemories
      .filter(m => m.category === 'fact')
      .slice(0, 5)
      .map(m => m.content);

    if (userFacts.length > 0) {
      parts.push('Facts about the user:\n' + userFacts.map(f => '- ' + f).join('\n'));
    }

    // Memory summary
    if (this.memorySummary) {
      parts.push('Conversation summary:\n' + this.memorySummary);
    }

    return parts.join('\n\n');
  }

  // ============ Chat History (Local) ============

  add(messageRole, content) {
    this.chatHistory.push({ role: messageRole, content });
    this.messageCount += 1;

    if (this.chatHistory.length > this.maxHistory * 2) {
      this.chatHistory = this.chatHistory.slice(-this.maxHistory);
    }

    // Update session activity periodically
    if (this.messageCount % 5 === 0) {
      this._updateSessionActivity();
    }

    console.log('[ChatMemory] History length:', this.chatHistory.length);
  }

  getHistory() {
    return this.chatHistory;
  }

  clearHistory() {
    this.chatHistory = [];
    this.messageCount = 0;
    console.log('[ChatMemory] History cleared');
  }

  getMaxHistory() {
    return this.maxHistory;
  }

  setMaxHistory(max) {
    this.maxHistory = max;
  }

  // ============ Fact Extraction ============

  async extractFacts(userText) {
    if (!this._aiController || !CONFIG?.memory?.factExtractionEnabled) {
      return;
    }

    try {
      const facts = await this._aiController._extractFactsFromText(userText);
      for (const fact of facts) {
        // User facts are private by default
        this.mergeFact(fact, { scope: 'user', privacy: 'private' });
      }
      if (facts.length > 0) {
        console.log('[ChatMemory] Extracted', facts.length, 'user facts');
      }
    } catch (e) {
      console.warn('[ChatMemory] Fact extraction skipped:', e.message);
    }
  }

  mergeFact(newFact, options = {}) {
    if (!newFact || !newFact.text) return;

    const scope = newFact.scope || 'user';
    const privacy = newFact.privacy || (scope === 'user' ? 'private' : 'public');

    const enrichedFact = {
      ...newFact,
      scope,
      privacy,
      id: newFact.id || Date.now().toString(),
      createdAt: newFact.createdAt || new Date().toISOString(),
    };

    const memories = scope === 'user' ? this.userMemories : this.modelMemories;

    const newText = (enrichedFact.text || '').toLowerCase();
    const existingIndex = memories.findIndex(
      f => (f.content || '').toLowerCase() === newText
    );

    if (existingIndex >= 0) {
      const existing = memories[existingIndex];
      if (enrichedFact.confidence > (existing.confidence || 0)) {
        memories[existingIndex] = enrichedFact;
      }
    } else {
      memories.push(enrichedFact);
    }

    // Enforce maxFacts limit
    const maxFacts = CONFIG?.memory?.maxFacts || 10;
    if (memories.length > maxFacts) {
      memories.sort((a, b) => (a.confidence || 0) - (b.confidence || 0));
      const trimmed = memories.slice(-maxFacts);
      if (scope === 'user') {
        this.userMemories = trimmed;
        this.userFacts = trimmed;
      } else {
        this.modelMemories = trimmed;
        this.characterFacts = trimmed;
      }
    } else {
      // Keep aliases in sync
      if (scope === 'user') {
        this.userFacts = this.userMemories;
      } else {
        this.characterFacts = this.modelMemories;
      }
    }

    // Sync to server
    if (scope === 'user' && this.currentUserId) {
      this.addUserMemory(enrichedFact.text, enrichedFact.category || 'fact');
    } else if (scope === 'model') {
      this.addModelMemory(enrichedFact.text, enrichedFact.category || 'fact', enrichedFact.confidence);
    }
  }

  // ============ Summarization ============

  async generateSummary() {
    if (!this._aiController || !this.chatHistory.length) return;

    try {
      const summary = await this._aiController._summarizeConversation(this.chatHistory);
      if (summary) {
        this.memorySummary = summary;
        // Trim chat history to keep only recent messages for context
        const keep = CONFIG.memory.maxMessagesWithSummary || 5;
        this.chatHistory = this.chatHistory.slice(-keep);
        console.log('[ChatMemory] Conversation summary generated');
      }
    } catch (e) {
      console.error('[ChatMemory] Summarization error:', e.message);
    }
  }

  maybeSummarize() {
    if (!this._aiController || !CONFIG.memory.summaryInterval) return false;

    const interval = CONFIG.memory.summaryInterval;
    if (this.messageCount >= interval && this.messageCount % interval === 0) {
      this.messageCount = 0;
      this.generateSummary().catch(err =>
        console.warn('[ChatMemory] Summarization failed:', err.message)
      );
      return true;
    }
    return false;
  }

  // ============ Character Facts ============

  addCharacterFact(fact) {
    this.mergeFact(fact, { scope: 'model', privacy: 'public' });
  }

  getCharacterFacts() {
    return this.modelMemories.filter(m => m.category === 'fact');
  }

  getCharacterFactsForPrompt() {
    const facts = this.getCharacterFacts();
    if (facts.length === 0) return '';

    const topFacts = facts
      .filter(f => f.privacy === 'public' || f.privacy === 'shared')
      .slice(0, 5);

    if (topFacts.length === 0) return '';

    return topFacts.map(f => '- ' + f.content).join('\n');
  }

  // ============ Compatibility Methods ============
  // Methods expected by aiController.js

  getActiveProfile() {
    return this.currentUserName || 'anonymous';
  }

  detectOrCreateProfile(name) {
    this.identifyUser(name);
    return name;
  }

  clear() {
    this.clearHistory();
    this.modelMemories = [];
    this.userMemories = [];
    this.characterFacts = [];
    this.userFacts = [];
    this.memorySummary = '';
    console.log('[ChatMemory] All data cleared');
  }

  save() {
    // No-op for server mode - data is saved via API calls
  }
}
