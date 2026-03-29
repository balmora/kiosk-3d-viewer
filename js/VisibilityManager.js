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
    this._allMeshes = [];
    
    // Find and store all meshes
    this._discoverMeshes();
    
    // Initialize mesh visibility from config
    this._initVisibility();
  }

  /**
   * Discover all meshes in the model
   */
  _discoverMeshes() {
    this._allMeshes = [];
    this.model.traverse((child) => {
      if (child.isMesh && child.name) {
        this._allMeshes.push({ name: child.name, mesh: child });
        logger.info(`VisibilityManager: Found mesh "${child.name}"`);
      }
    });
    logger.info(`VisibilityManager: Total meshes found: ${this._allMeshes.length}`);
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
        logger.info(`VisibilityManager: Set "${meshName}" visible=${mesh.visible}`);
      }
    }
    
    // Apply default outfit if specified
    if (this.config.outfits?.default) {
      this.currentOutfit = 'default';
      this.switchOutfit('default');
    }
  }

  /**
   * Find a mesh by name in the model hierarchy
   */
  _findMesh(meshName) {
    const searchName = meshName.toLowerCase();
    
    // First try exact match
    for (const { name, mesh } of this._allMeshes) {
      if (name.toLowerCase() === searchName) {
        return mesh;
      }
    }
    
    // Then try partial match (contains)
    for (const { name, mesh } of this._allMeshes) {
      if (name.toLowerCase().includes(searchName) || searchName.includes(name.toLowerCase())) {
        logger.debug(`VisibilityManager: Partial match "${meshName}" -> "${name}"`);
        return mesh;
      }
    }
    
    logger.warn(`VisibilityManager: Mesh "${meshName}" not found in model`);
    logger.debug(`VisibilityManager: Available meshes: ${this._allMeshes.map(m => m.name).join(', ')}`);
    
    return null;
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
    
    logger.info(`VisibilityManager: Switching to outfit "${outfitName}"`);
    
    // Hide all meshes first
    const configuredMeshes = this.config.meshes || {};
    for (const meshName of Object.keys(configuredMeshes)) {
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
        logger.info(`VisibilityManager: Showing mesh "${meshName}"`);
      } else {
        logger.warn(`VisibilityManager: Mesh "${meshName}" not found for outfit "${outfitName}"`);
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

  /**
   * Toggle a mesh's visibility
   */
  toggleMesh(meshName) {
    const mesh = this._findMesh(meshName);
    if (mesh) {
      mesh.visible = !mesh.visible;
      logger.info(`VisibilityManager: Toggled "${meshName}" to visible=${mesh.visible}`);
      return mesh.visible;
    }
    return null;
  }

  /**
   * Set a mesh's visibility
   */
  setMeshVisibility(meshName, visible) {
    const mesh = this._findMesh(meshName);
    if (mesh) {
      mesh.visible = visible;
      logger.info(`VisibilityManager: Set "${meshName}" visible=${visible}`);
      return true;
    }
    return false;
  }

  /**
   * Get all meshes with their current visibility
   */
  getAllMeshes() {
    return this._allMeshes.map(({ name, mesh }) => ({
      name: name,
      visible: mesh.visible,
      description: this.config.meshes?.[name]?.description || ''
    }));
  }

  /**
   * Build UI for mesh toggles
   */
  buildToggleUI() {
    const panel = document.createElement('div');
    panel.id = 'visibilityPanel';
    panel.style.cssText = `
      position: fixed;
      top: 70px;
      right: 20px;
      background: rgba(0,0,0,0.9);
      border-radius: 12px;
      padding: 15px;
      z-index: 200;
      min-width: 200px;
      font-family: sans-serif;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'color: #ff69b4; font-size: 14px; margin-bottom: 10px; font-weight: bold;';
    header.textContent = '🎭 Meshes';
    panel.appendChild(header);

    const meshes = this.getAllMeshes();
    
    for (const m of meshes) {
      const row = document.createElement('label');
      row.style.cssText = 'display: flex; align-items: center; gap: 8px; color: #ddd; font-size: 12px; margin: 5px 0; cursor: pointer;';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = m.visible;
      checkbox.dataset.meshName = m.name;
      checkbox.style.cssText = 'cursor: pointer;';
      checkbox.addEventListener('change', () => {
        this.setMeshVisibility(m.name, checkbox.checked);
      });

      const desc = m.description ? ` - ${m.description}` : '';
      row.innerHTML = `<span>${m.name}${desc}</span>`;
      row.insertBefore(checkbox, row.firstChild);
      
      panel.appendChild(row);
    }

    document.body.appendChild(panel);
    return panel;
  }

  /**
   * Remove toggle UI
   */
  removeToggleUI() {
    const panel = document.getElementById('visibilityPanel');
    if (panel) panel.remove();
  }

  /**
   * Toggle visibility UI
   */
  toggleUI() {
    const existing = document.getElementById('visibilityPanel');
    if (existing) {
      existing.remove();
    } else {
      this.buildToggleUI();
    }
  }
}
