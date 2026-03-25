import { CONFIG } from './config.js?v=2';

export class ChatMemory {
  constructor(storageKey = 'luna_chat_history', maxHistory = 10) {
    this.storageKey = storageKey;
    this.maxHistory = maxHistory;
    this.profiles = {};
    this.activeProfileKey = null;
    this._activeProfile = null; // cached reference to active profile data
    this._aiController = null; // Reference to AIController for Ollama calls

    // Per-profile state (will be populated from _activeProfile)
    this.chatHistory = [];
    this.userInfo = {
      name: null,
      lastVisit: null,
      visitCount: 0,
    };
    this.userFacts = []; // extracted structured facts
    this.memorySummary = ''; // conversation summary
  }

  setAI(aiController) {
    this._aiController = aiController;
  }

  _getRawData() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to load chat storage:', e);
      return null;
    }
  }

  _getAllData() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return { version: 2, profiles: {}, activeProfile: null };
      }
      const data = JSON.parse(raw);
      // Ensure required fields exist
      if (!data.version) data.version = 2;
      if (!data.profiles) data.profiles = {};
      if (!data.activeProfile) data.activeProfile = null;
      return data;
    } catch (e) {
      console.error('Failed to load chat storage:', e);
      return { version: 2, profiles: {}, activeProfile: null };
    }
  }

  _saveAllData(data) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      console.log('All profiles saved:', Object.keys(data.profiles || {}).length, 'profiles');
    } catch (e) {
      console.error('Failed to save all profiles:', e);
    }
  }

  _normalizeProfileKey(key) {
    return key ? key.toLowerCase().trim().replace(/\s+/g, '_') : 'default';
  }

  _ensureDefaultProfile() {
    // Use the profiles map already loaded in this.profiles
    if (!this.profiles) {
      this.profiles = {};
    }
    if (!this.profiles.default) {
      this.profiles.default = {
        chatHistory: [],
        userInfo: { name: null, lastVisit: null, visitCount: 0 },
        messageCount: 0,
        memorySummary: '',
        userFacts: []
      };
    }
  }

  _loadActiveProfileState() {
    if (!this.activeProfileKey) {
      this.activeProfileKey = 'default';
    }
    if (!this.profiles[this.activeProfileKey]) {
      console.warn(`Profile "${this.activeProfileKey}" not found, creating it`);
      this.profiles[this.activeProfileKey] = {
        chatHistory: [],
        userInfo: { name: null, lastVisit: null, visitCount: 0 },
        messageCount: 0,
        memorySummary: '',
        userFacts: []
      };
    }

    this._activeProfile = this.profiles[this.activeProfileKey];
    this.chatHistory = this._activeProfile.chatHistory || [];
    this.userInfo = this._activeProfile.userInfo || { name: null, lastVisit: null, visitCount: 0 };
    this.userFacts = this._activeProfile.userFacts || [];
    this.memorySummary = this._activeProfile.memorySummary || '';
  }

  _saveActiveProfile() {
    if (!this._activeProfile || !this.activeProfileKey) return;

    // Update the profile data from instance fields
    this._activeProfile.chatHistory = this.chatHistory;
    this._activeProfile.userInfo = this.userInfo;
    this._activeProfile.userFacts = this.userFacts;
    this._activeProfile.memorySummary = this.memorySummary;

    const allData = this._getAllData();
    // Ensure profiles object exists
    if (!allData.profiles) allData.profiles = {};
    allData.profiles[this.activeProfileKey] = this._activeProfile;
    allData.activeProfile = this.activeProfileKey;
    this._saveAllData(allData);
  }

  load() {
    const allData = this._getAllData();
    const version = allData.version || 1;

    // Migrate legacy data if needed
    if (version < 2) {
      console.log('Migrating legacy data to v2 format...');
      allData.version = 2;
      const migratedProfiles = this._migrateLegacyData(allData);
      allData.profiles = migratedProfiles;
      allData.activeProfile = Object.keys(migratedProfiles)[0] || 'default';
      this._saveAllData(allData);
    }

    // Initialize profiles map from storage
    this.profiles = allData.profiles || {};

    // Ensure default profile exists (in-place modification of this.profiles)
    this._ensureDefaultProfile();

    // If we created the default profile and storage didn't have it, save it back
    if (!allData.profiles || !allData.profiles.default) {
      allData.profiles = this.profiles;
      allData.activeProfile = this.activeProfileKey || 'default';
      this._saveAllData(allData);
    }

    // Set active profile key
    this.activeProfileKey = allData.activeProfile || 'default';

    // Load active profile into instance fields
    this._loadActiveProfileState();

    // Handle visit count for active profile (only increment on new calendar day)
    const now = new Date();
    const lastVisitDate = this.userInfo.lastVisit
      ? new Date(this.userInfo.lastVisit).toDateString()
      : null;
    const today = now.toDateString();

    if (!lastVisitDate || lastVisitDate !== today) {
      this.userInfo.visitCount += 1;
    }
    this.userInfo.lastVisit = now.toISOString();

    // Save updated visit info
    this._saveActiveProfile();

    console.log('Profile:', this.activeProfileKey);
    console.log('History loaded:', this.chatHistory.length, 'messages');
    console.log('User name:', this.userInfo.name);
    console.log('Visit count:', this.userInfo.visitCount);
  }

  save() {
    this._saveActiveProfile();
  }

  add(messageRole, content) {
    this.chatHistory.push({ role: messageRole, content });

    // Increment message count for summarization
    if (this._activeProfile) {
      this._activeProfile.messageCount = (this._activeProfile.messageCount || 0) + 1;
    }

    if (this.chatHistory.length > this.maxHistory * 2) {
      this.chatHistory = this.chatHistory.slice(-this.maxHistory);
    }
    this.save();
    console.log('History length:', this.chatHistory.length);
  }

  maybeSummarize() {
    if (!this._aiController || !CONFIG.memory.summaryInterval) return false;

    const interval = CONFIG.memory.summaryInterval;
    // Check if we should summarize (every N messages, but only after we have enough history)
    if (this._activeProfile &&
        this._activeProfile.messageCount >= interval &&
        this._activeProfile.messageCount % interval === 0) {
      // Trigger summary generation (fire-and-forget)
      this._activeProfile.messageCount = 0; // Reset counter to avoid repeated triggers
      this.generateSummary().catch(err =>
        logger.warn('Summarization failed:', err.message)
      );
      return true;
    }
    return false;
  }

  async generateSummary() {
    if (!this._aiController || !this.chatHistory.length) return;

    try {
      const summary = await this._aiController._summarizeConversation(this.chatHistory);
      if (summary) {
        this.memorySummary = summary;
        this._activeProfile.memorySummary = summary;
        // Trim chat history to keep only recent messages for context
        const keep = CONFIG.memory.maxMessagesWithSummary || 5;
        this.chatHistory = this.chatHistory.slice(-keep);
        this._saveActiveProfile();
        logger.info('Conversation summary generated:', summary.substring(0, 100) + '...');
      }
    } catch (e) {
      logger.error('Summarization error:', e.message);
      // Restore message count so we can retry later
      if (this._activeProfile) {
        this._activeProfile.messageCount += CONFIG.memory.summaryInterval;
      }
    }
  }

  clear() {
    if (this.activeProfileKey && this.profiles[this.activeProfileKey]) {
      // Clear just this profile
      this.profiles[this.activeProfileKey] = {
        chatHistory: [],
        userInfo: { name: null, lastVisit: null, visitCount: 0 },
        messageCount: 0,
        memorySummary: '',
        userFacts: []
      };
      this._loadActiveProfileState();
      this._saveAllData(this.profiles);
    } else {
      // Fallback: clear entire storage
      localStorage.removeItem(this.storageKey);
    }
    console.log('Profile cleared:', this.activeProfileKey);
  }

  getMaxHistory() {
    return this.maxHistory;
  }

  setMaxHistory(max) {
    this.maxHistory = max;
  }

  // ============ Profile Management ============

  getProfiles() {
    return Object.keys(this.profiles);
  }

  getActiveProfile() {
    return this.activeProfileKey;
  }

  getProfile(key) {
    const normalized = this._normalizeProfileKey(key);
    return this.profiles[normalized] || null;
  }

  createProfile(key, options = {}) {
    const normalized = this._normalizeProfileKey(key);
    if (this.profiles[normalized]) {
      console.warn(`Profile "${normalized}" already exists`);
      return false;
    }

    this.profiles[normalized] = {
      chatHistory: [],
      userInfo: {
        name: options.name || key,
        lastVisit: null,
        visitCount: 0
      },
      messageCount: 0,
      memorySummary: '',
      userFacts: []
    };
    // Save full data structure (not just profiles)
    const allData = this._getAllData();
    allData.profiles[normalized] = this.profiles[normalized];
    this._saveAllData(allData);
    console.log(`Created profile: ${normalized}`);
    return true;
  }

  switchProfile(key) {
    const normalized = this._normalizeProfileKey(key);
    if (!this.profiles[normalized]) {
      console.warn(`Profile "${normalized}" not found, creating it automatically`);
      this.profiles[normalized] = {
        chatHistory: [],
        userInfo: { name: null, lastVisit: null, visitCount: 0 },
        messageCount: 0,
        memorySummary: '',
        userFacts: []
      };
    }

    this.activeProfileKey = normalized;
    this._loadActiveProfileState();
    this._saveActiveProfile(); // Save active profile pointer
    console.log(`Switched to profile: ${normalized}`);
    return true;
  }

  detectProfileFromName(name) {
    const normalized = this._normalizeProfileKey(name);
    return this.profiles[normalized] ? normalized : null;
  }

  detectOrCreateProfile(name) {
    const normalized = this._normalizeProfileKey(name);
    if (!this.profiles[normalized]) {
      this.createProfile(normalized, { name });
    }
    if (this.activeProfileKey !== normalized) {
      this.switchProfile(normalized);
    }
    return normalized;
  }

  // ============ Fact Extraction ============

  mergeFact(newFact) {
    if (!this._activeProfile || !newFact || !newFact.text) return;

    const existingIndex = this._activeProfile.userFacts.findIndex(
      f => f.text.toLowerCase() === newFact.text.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Update existing fact with higher confidence or newer timestamp
      const existing = this._activeProfile.userFacts[existingIndex];
      if (newFact.confidence > existing.confidence) {
        this._activeProfile.userFacts[existingIndex] = {
          ...newFact,
          lastUpdated: new Date().toISOString()
        };
      }
    } else {
      // Add new fact
      this._activeProfile.userFacts.push({
        ...newFact,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
    }

    // Enforce maxFacts limit
    const maxFacts = CONFIG?.memory?.maxFacts || 10;
    if (this._activeProfile.userFacts.length > maxFacts) {
      // Remove lowest confidence facts
      this._activeProfile.userFacts.sort((a, b) => a.confidence - b.confidence);
      this._activeProfile.userFacts = this._activeProfile.userFacts.slice(-maxFacts);
    }
  }

  async extractFacts(userText) {
    if (!this._aiController || !CONFIG?.memory?.factExtractionEnabled) {
      return Promise.resolve();
    }

    try {
      const facts = await this._aiController._extractFactsFromText(userText);
      for (const fact of facts) {
        this.mergeFact(fact);
      }
      if (facts.length > 0) {
        this._saveActiveProfile();
        logger.debug('Extracted', facts.length, 'new facts');
      }
    } catch (e) {
      logger.warn('Fact extraction skipped:', e.message);
    }
    return Promise.resolve();
  }

  // ============ Migration ============

  _migrateLegacyData(oldData) {
    const profiles = {};

    // Convert old {history, userInfo} to profile "default"
    const legacyProfile = {
      chatHistory: (oldData.history || []).slice(-this.maxHistory),
      userInfo: {
        name: oldData.userInfo?.name || null,
        lastVisit: oldData.userInfo?.lastVisit || null,
        visitCount: oldData.userInfo?.visitCount || 0
      },
      messageCount: oldData.history ? oldData.history.length : 0,
      memorySummary: '',
      userFacts: []
    };

    profiles.default = legacyProfile;

    // If there was a saved user name but no explicit profile, could create one
    // For now, everything goes to default
    console.log('Migrated legacy data to profile: default');
    return profiles;
  }
}