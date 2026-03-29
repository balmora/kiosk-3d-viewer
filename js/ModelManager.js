/**
 * ModelManager - Handles model discovery, loading, and switching
 * 
 * Manages multiple 3D models with their associated character sheets.
 * Models are stored in subfolders under /models/ with optional character.json files.
 * 
 * Folder structure:
 * /models/
 *   Luna/
 *     Luna.gltf
 *     character.json (optional)
 *   2B/
 *     2B.gltf
 *     character.json (optional)
 */

import { DEFAULT_CHARACTER_SHEET } from './characterSchema.js';
import { logger } from './logger.js';

export class ModelManager {
  constructor() {
    this.models = [];           // List of available models
    this.currentModel = null;   // Currently loaded model info
    this.currentCharacterSheet = null;
    this.modelPath = null;
    this.storageKey = 'kiosk_selected_model';
    this.characterSheetCache = new Map(); // Cache to avoid repeated fetches
  }

  /**
   * Save selected model to localStorage
   */
  _saveSelectedModel(modelName) {
    try {
      localStorage.setItem(this.storageKey, modelName);
    } catch (e) {
      logger.warn('Failed to save selected model:', e);
    }
  }

  /**
   * Load saved model name from localStorage
   */
  _loadSavedModelName() {
    try {
      return localStorage.getItem(this.storageKey);
    } catch (e) {
      return null;
    }
  }

  /**
   * Discover all available models in the /models/ folder
   */
  async discoverModels() {
    logger.info('Discovering available models...');
    
    // Hardcoded list of expected model names - add your models here
    const possibleNames = ['Luna', '2B'];
    
    // Run all model checks in parallel with overall timeout
    const overallTimeout = 15000; // 15 second total timeout for all discovery
    
    try {
      const results = await Promise.race([
        Promise.all(possibleNames.map(name => this._checkModel(name))),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Discovery timeout')), overallTimeout))
      ]);
      
      const models = results.filter(Boolean);
      
      // Sort by priority (lower number = higher priority)
      models.sort((a, b) => (a.priority || 999) - (b.priority || 999));
      
      this.models = models;
      logger.info(`Found ${models.length} model(s):`, models.map(m => m.name).join(', '));
      
      return models;
    } catch (e) {
      logger.error('Model discovery error:', e.message);
      // Return whatever models we have so far
      return this.models;
    }
  }

  /**
   * Check if a model exists at the expected path
   */
  async _checkModel(name) {
    const basePath = `./models/${name}`;
    
    // First, load character sheet to check for explicit filename
    const characterSheet = await this._loadCharacterSheet(name);
    if (!characterSheet) {
      logger.warn(`Model "${name}": No character sheet, skipping`);
      return null;
    }
    
    const filename = characterSheet?.model?.filename;
    
    // If character sheet specifies a filename, try that first
    if (filename) {
      const modelPath = `${basePath}/${filename}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(modelPath, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          return {
            name: name,
            displayName: characterSheet?.identity?.name || name,
            path: modelPath,
            folder: basePath,
            characterSheet: characterSheet,
            priority: characterSheet?.priority || 999
          };
        }
      } catch (e) {
        logger.debug(`Model not found at ${modelPath}: ${e.message}`);
      }
    }
    
    // Fall back to guessing filename from folder name
    const extensions = ['.gltf', '.glb'];
    for (const ext of extensions) {
      const modelPath = `${basePath}/${name}${ext}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(modelPath, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          return {
            name: name,
            displayName: characterSheet?.identity?.name || name,
            path: modelPath,
            folder: basePath,
            characterSheet: characterSheet,
            priority: characterSheet?.priority || 999
          };
        }
      } catch (e) {
        logger.debug(`Model not found at ${modelPath}: ${e.message}`);
      }
    }
    
    return null;
  }

  /**
   * Load character sheet from model's folder (with caching)
   */
  async _loadCharacterSheet(modelName) {
    // Check cache first
    if (this.characterSheetCache.has(modelName)) {
      return this.characterSheetCache.get(modelName);
    }
    
    const charPath = `./models/${modelName}/character.json`;
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(charPath, {
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        const sheet = await response.json();
        logger.info(`Loaded character sheet for ${sheet.identity?.name || modelName}`);
        // Cache for future use
        this.characterSheetCache.set(modelName, sheet);
        return sheet;
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        logger.warn(`Character sheet fetch timeout for ${modelName}`);
      } else {
        logger.debug(`No character sheet found for ${modelName}: ${e.message}`);
      }
    }
    
    // Cache null results too to avoid repeated failed fetches
    this.characterSheetCache.set(modelName, null);
    return null;
  }

  /**
   * Get list of available models for UI
   */
  getAvailableModels() {
    return this.models.map(m => ({
      name: m.name,
      displayName: m.displayName,
      path: m.path
    }));
  }

  /**
   * Get the first model to load (saved preference, or highest priority)
   */
  getDefaultModel() {
    if (this.models.length === 0) return null;
    
    // Check for saved model preference
    const savedModelName = this._loadSavedModelName();
    if (savedModelName) {
      const savedModel = this.findModelByName(savedModelName);
      if (savedModel) {
        logger.info(`Loading saved model: ${savedModel.displayName}`);
        return savedModel;
      }
    }
    
    // Fall back to highest priority model
    return this.models[0];
  }

  /**
   * Find a model by name (case-insensitive)
   */
  findModelByName(name) {
    const normalized = name.toLowerCase().trim();
    return this.models.find(m => 
      m.name.toLowerCase() === normalized ||
      m.displayName.toLowerCase() === normalized
    );
  }

  /**
   * Load a specific model by name
   */
  async loadModel(name) {
    const modelInfo = this.findModelByName(name);
    
    if (!modelInfo) {
      logger.warn(`Model "${name}" not found`);
      return null;
    }
    
    logger.info(`Loading model: ${modelInfo.displayName}`);
    
    this.currentModel = modelInfo;
    this.modelPath = modelInfo.path;
    this.currentCharacterSheet = modelInfo.characterSheet || { ...DEFAULT_CHARACTER_SHEET };
    
    // Update default sheet name if no character sheet
    if (!modelInfo.characterSheet) {
      this.currentCharacterSheet.identity.name = modelInfo.displayName;
    }
    
    // Save preference to localStorage
    this._saveSelectedModel(modelInfo.name);
    
    return {
      modelPath: this.modelPath,
      characterSheet: this.currentCharacterSheet
    };
  }

  /**
   * Get the current model path
   */
  getCurrentModelPath() {
    return this.modelPath;
  }

  /**
   * Get the current character sheet
   */
  getCurrentCharacterSheet() {
    return this.currentCharacterSheet;
  }

  /**
   * Get the current model info
   */
  getCurrentModel() {
    return this.currentModel;
  }

  /**
   * Check if a model name matches the current model
   */
  isCurrentModel(name) {
    if (!this.currentModel) return false;
    const normalized = name.toLowerCase().trim();
    return (
      this.currentModel.name.toLowerCase() === normalized ||
      this.currentModel.displayName.toLowerCase() === normalized
    );
  }
}

// Singleton instance
export const modelManager = new ModelManager();
