// commandExecutor.js
// Executes system commands triggered by AI or user

import { logger } from './logger.js';

export class CommandExecutor {
  constructor() {
    this.allowedCommands = new Set([
      'update.py',
      'update',
    ]);
  }

  async execute(scriptName) {
    if (!this.isAllowed(scriptName)) {
      logger.warn(`CommandExecutor: Command "${scriptName}" not allowed`);
      return { success: false, error: 'Command not allowed' };
    }

    logger.info(`CommandExecutor: Requesting execution of "${scriptName}"`);
    
    // Open the script in a new window - this lets the user run it
    // We use window.open because browser security prevents direct script execution
    const success = window.open(scriptName, '_blank');
    
    if (success) {
      logger.info(`CommandExecutor: Opened "${scriptName}"`);
      return { success: true, message: `Opened ${scriptName} - please complete the update in the new window` };
    } else {
      logger.error(`CommandExecutor: Failed to open "${scriptName}"`);
      return { success: false, error: 'Popup blocked - please allow popups for this site' };
    }
  }

  isAllowed(command) {
    return this.allowedCommands.has(command) || 
           this.allowedCommands.has(command.replace('.py', ''));
  }

  listAllowedCommands() {
    return Array.from(this.allowedCommands);
  }
}

// Singleton instance
export const commandExecutor = new CommandExecutor();
