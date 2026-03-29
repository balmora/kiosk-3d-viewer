/**
 * VisibilityManager - Handles mesh visibility and outfit switching
 * 
 * Manages which meshes are visible based on the current outfit.
 * Supports time-based rules and AI-powered outfit suggestions.
 */

import { logger } from './logger.js';

export class VisibilityManager {
  constructor(model, visibilityConfig) {
    this.model = model;
    this.config = visibilityConfig || {};
    this.currentOutfit = 'default';
    
    // Initialize mesh visibility from config
    this._initVisibility();
  }

  /**
   * Initialize all meshes to their configured visibility state
   */
  _initVisibility() {
    const meshes = this.config.meshes || {};
    
    for (const [meshName, settings] of Object.entries(meshes)) {
      const mesh = this._findMesh(meshName);
      if (mesh) {
        mesh.visible = settings.visible !== false;
      }
    }
    
    // Apply default outfit if specified
    if (this.config.outfits?.default) {
      this.currentOutfit = 'default';
      this._applyOutfit('default');
    }
  }

  /**
   * Find a mesh by name in the model hierarchy
   */
  _findMesh(meshName) {
    let found = null;
    
    this.model.traverse((child) => {
      if (child.name && child.name.toLowerCase() === meshName.toLowerCase()) {
        found = child;
      }
    });
    
    // Also check without case sensitivity for partial matches
    if (!found) {
      this.model.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes(meshName.toLowerCase())) {
          found = child;
        }
      });
    }
    
    if (!found) {
      logger.debug(`VisibilityManager: Mesh "${meshName}" not found in model`);
    }
    
    return found;
  }

  /**
   * Apply an outfit - show/hide meshes based on outfit definition
   */
  switchOutfit(outfitName) {
    const outfit = this.config.outfits?.[outfitName];
    
    if (!outfit) {
      logger.warn(`VisibilityManager: Outfit "${outfitName}" not found`);
      return false;
    }
    
    // Hide all meshes first
    const allMeshes = this.config.meshes || {};
    for (const meshName of Object.keys(allMeshes)) {
      const mesh = this._findMesh(meshName);
      if (mesh) {
        mesh.visible = false;
      }
    }
    
    // Show meshes that belong to this outfit
    const meshesToShow = outfit.meshes || [];
    for (const meshName of meshesToShow) {
      const mesh = this._findMesh(meshName);
      if (mesh) {
        mesh.visible = true;
      } else {
        // If mesh doesn't exist, just log it (model might not have it)
        logger.debug(`VisibilityManager: Mesh "${meshName}" not found (outfit: ${outfitName})`);
      }
    }
    
    this.currentOutfit = outfitName;
    logger.info(`VisibilityManager: Switched to outfit "${outfitName}"`);
    
    return true;
  }

  /**
   * Get list of available outfits
   */
  getAvailableOutfits() {
    const outfits = this.config.outfits || {};
    
    return Object.entries(outfits).map(([name, outfit]) => ({
      name: name,
      description: outfit.description || '',
      tags: outfit.tags || [],
      isCurrent: name === this.currentOutfit
    }));
  }

  /**
   * Get current outfit name
   */
  getCurrentOutfit() {
    return this.currentOutfit;
  }

  /**
   * Format outfits for AI context
   */
  getOutfitsForPrompt() {
    const outfits = this.getAvailableOutfits();
    
    let prompt = 'Available outfits:\n';
    for (const outfit of outfits) {
      const current = outfit.isCurrent ? ' (current)' : '';
      prompt += `- ${outfit.name}${current}: ${outfit.description}\n`;
    }
    
    return prompt;
  }

  /**
   * Get time-based outfit suggestion
   */
  getTimeBasedOutfit() {
    const timeRules = this.config.time_rules || {};
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    
    // Find matching time rule (simple comparison)
    for (const [time, outfit] of Object.entries(timeRules)) {
      const [ruleHour, ruleMinute] = time.split(':').map(Number);
      
      // Calculate minutes since midnight
      const ruleMinutes = ruleHour * 60 + ruleMinute;
      const currentMinutes = currentHour * 60 + currentMinute;
      
      // Check if within 30 minutes of the rule time
      if (Math.abs(currentMinutes - ruleMinutes) <= 30) {
        return outfit;
      }
    }
    
    return null;
  }

  /**
   * Suggest outfit via AI based on conversation context
   */
  async suggestOutfitViaAI(conversationHistory, ollamaUrl, ollamaModel) {
    const outfits = this.getOutfitsForPrompt();
    const timeOutfit = this.getTimeBasedOutfit();
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const currentOutfit = this.currentOutfit;
    
    const recentMessages = conversationHistory.slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const prompt = `You are a fashion advisor for a 3D character. Based on the context, suggest the best outfit.

Current time: ${timeString}
Current outfit: ${currentOutfit}
${timeOutfit ? `Time-appropriate outfit: ${timeOutfit}` : ''}

${outfits}

Recent conversation:
${recentMessages || 'No recent conversation'}

Instructions:
- Consider the time of day (evening = pjs, daytime = casual/armor)
- Consider topics discussed (pool/beach = swimsuit, combat/mission = armor)
- Suggest ONLY the outfit name, nothing else
- If current outfit is fine, say "keep_current"
- Maximum 1 word response (the outfit name)`;

    try {
      const response = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [
            { role: 'system', content: 'You are a helpful fashion advisor. Respond with ONLY the outfit name.' },
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 10
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }
      
      const data = await response.json();
      const suggestion = data.message?.content?.trim().toLowerCase();
      
      // Validate suggestion
      const availableOutfits = Object.keys(this.config.outfits || {});
      if (suggestion === 'keep_current' || suggestion === currentOutfit) {
        return { outfit: null, reason: 'Current outfit is appropriate' };
      }
      
      if (availableOutfits.includes(suggestion)) {
        return { outfit: suggestion, reason: 'AI suggested based on context' };
      }
      
      logger.warn(`VisibilityManager: Invalid outfit suggestion "${suggestion}"`);
      return { outfit: null, reason: 'No appropriate outfit found' };
      
    } catch (error) {
      logger.error('VisibilityManager: AI suggestion failed:', error.message);
      return { outfit: timeOutfit, reason: 'Fallback to time-based suggestion' };
    }
  }

  /**
   * Check if outfit exists
   */
  hasOutfit(outfitName) {
    return !!this.config.outfits?.[outfitName];
  }
}
