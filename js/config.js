/**
 * Central configuration for the Kiosk 3D Viewer
 * All hardcoded settings should live here for easy modification
 */

// Determine avatar name from model filename (e.g., "Luna.gltf" -> "Luna")
function deriveAvatarName(modelPath) {
  const filename = modelPath.split('/').pop().split('\\').pop();
  const name = filename.replace(/\.[^/.]+$/, '');
  return name || 'Luna';
}

export const CONFIG = {
  // Avatar identity (derived from model filename by default)
  avatar: {
    name: 'Luna'  // Set explicit name; change here to customize
  },

  // 3D Model settings
  model: {
    path: './models/Luna.gltf',
    heightM: 1.75,
    floorOffsetY: 0.85,
  },

  // Camera settings
  camera: {
    fov: 50,
    positionZ: 3.5,
    positionY: 1.0,
    lookAtY: 0.9,
    minDistance: 1.0,
    maxDistance: 8.0,
  },

  // Floor settings
  floor: {
    offsetY: 0.0,
    radius: 1.0,
    color: 0x333344,
    ringColor: 0x66aaff,
    ringOpacity: 0.8,
    ringInner: 0.4,
    ringOuter: 0.45,
  },

  // Glow/Spot lighting settings
  glow: {
    color: 0x33A0A4,     // cyan
    intensity: 0,        // 0-10, default off
  },

  spot: {
    count: 0,            // number of spots, default off
    color: 0x33A0A4,     // cyan
    direction: 'both',   // 'upward' | 'outward' | 'both'
  },

  // Ollama AI backend
  ollama: {
    url: 'http://localhost:11434/api/chat',
    model: 'leeplenty/ellaria',
    temperature: 0.6,
    num_predict: 40,
    stop: ['.', '!', '?'],
    maxHistory: 6
  },

  // Kokoro TTS server
  tts: {
    baseUrl: 'http://localhost:8000',
    healthEndpoint: '/health',
    ttsEndpoint: '/tts',
    streamEndpoint: '/tts/stream',
    voice: 'af_sarah',
    speed: 1.0,
    useStream: true,
    timeout: 10000,
    retries: 2
  },

  // Animation
  animation: {
    headBobIntensity: 0.8,
    idleBlinkInterval: 4000,
  },

  // UI
  ui: {
    historyPanelWidth: 380,
    historyPanelMaxHeight: 300,
    bubbleMaxWidth: 400,
    queueCheckInterval: 100
  },

  // Logging
  logging: {
    level: 'info',
    useColors: true,
    useTimestamps: true
  },

  // Memory (Persistent multi-profile system)
  memory: {
    factExtractionEnabled: true,
    maxFacts: 10,
    factExtractionDebounceMs: 30000,
    summaryInterval: 20,
    maxMessagesWithSummary: 5,
    summarizationDebounceMs: 60000,
    defaultPrivacy: 'private',  // 'private', 'shared', or 'public'
    useServerStorage: true,    // Use server API instead of localStorage
    apiUrl: localStorage.getItem('api_url') || 'http://localhost:8090'
  }
};

/**
 * Helper to get Ollama URL
 */
export function getOllamaUrl() {
  return CONFIG.ollama.url;
}

/**
 * Helper to get TTS URLs
 */
export function getTtsUrls() {
  const base = CONFIG.tts.baseUrl;
  return {
    health: base + CONFIG.tts.healthEndpoint,
    tts: base + CONFIG.tts.ttsEndpoint,
    stream: base + CONFIG.tts.streamEndpoint
  };
}

/**
 * Map log level string to numeric level
 */
export function getLogLevel(levelStr) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  return levels[levelStr] || 1;
}

/**
 * Set the memory API URL
 */
export function setMemoryApiUrl(url) {
  url = url.replace(/\/+$/, '');
  localStorage.setItem('api_url', url);
  CONFIG.memory.apiUrl = url;
  console.log('[CONFIG] Memory API URL set to:', url);
}

/**
 * Get the current memory API URL
 */
export function getMemoryApiUrl() {
  return CONFIG.memory.apiUrl;
}
