export class ChatMemory {
  constructor(storageKey = 'luna_chat_history', maxHistory = 10) {
    this.storageKey = storageKey;
    this.maxHistory = maxHistory;
    this.chatHistory = [];
    this.userInfo = {
      name: null,
      lastVisit: null,
      visitCount: 0,
    };
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

  load() {
    const data = this._getRawData();
    if (!data) {
      this.userInfo.visitCount = 0;
      this.userInfo.lastVisit = null;
      this.chatHistory = [];
      return;
    }

    this.chatHistory = (data.history || []).slice(-this.maxHistory);
    this.userInfo.name = data.userInfo?.name || null;
    this.userInfo.lastVisit = data.userInfo?.lastVisit || null;
    this.userInfo.visitCount = data.userInfo?.visitCount || 0;

    // Only increment if visiting a new calendar day
    const now = new Date();
    const lastVisitDate = this.userInfo.lastVisit
      ? new Date(this.userInfo.lastVisit).toDateString()
      : null;
    const today = now.toDateString();

    if (!lastVisitDate || lastVisitDate !== today) {
      this.userInfo.visitCount += 1;
    }
    this.userInfo.lastVisit = now.toISOString();
    this.save();
    console.log('History loaded:', this.chatHistory.length, 'messages');
    console.log('User name:', this.userInfo.name);
    console.log('Visit count:', this.userInfo.visitCount);
  }

  save() {
    try {
      const data = {
        history: this.chatHistory,
        userInfo: this.userInfo,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      console.log('History saved:', this.chatHistory.length, 'messages');
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  }

  add(messageRole, content) {
    this.chatHistory.push({ role: messageRole, content });
    if (this.chatHistory.length > this.maxHistory * 2) {
      this.chatHistory = this.chatHistory.slice(-this.maxHistory);
    }
    this.save();
    console.log('History length:', this.chatHistory.length);
  }

  clear() {
    this.chatHistory = [];
    this.userInfo.name = null;
    this.userInfo.visitCount = 0;
    localStorage.removeItem(this.storageKey);
    console.log('History cleared');
  }

  getMaxHistory() {
    return this.maxHistory;
  }

  setMaxHistory(max) {
    this.maxHistory = max;
  }
}