/**
 * Utility functions for user notifications with consistent formatting
 */

/**
 * Send a notification to the user
 * 
 * @param message Message to display
 * @param options Optional configuration for the notification
 */
export function notifyUser(message: string, options: { error?: boolean, timeout?: number } = {}): void {
  const timeout = options.timeout || (options.error ? 10000 : 5000); // Longer timeout for errors
  try {
    figma.notify(message, { timeout });
    
    // Also log to console for debugging
    if (options.error) {
      console.error(`NOTIFICATION ERROR: ${message}`);
    } else {
      console.log(`NOTIFICATION: ${message}`);
    }
    
    // Also send to UI if available
    figma.ui.postMessage({ 
      type: options.error ? 'error-notification' : 'notification',
      message: message
    });
  } catch (err: unknown) {
    // Fallback to console if notification fails
    console.error(`Failed to show notification: ${message}`);
  }
}

/**
 * Send progress update to the UI
 * 
 * @param message Progress message
 * @param percentage Optional percentage complete (0-100)
 */
export function sendProgressUpdate(message: string, percentage?: number): void {
  try {
    figma.ui.postMessage({ 
      type: 'update-progress', 
      message,
      percentage
    });
  } catch (err: unknown) {
    console.error(`Failed to send progress update: ${message}`);
  }
}

/**
 * Send debug information to the UI
 * 
 * @param message Debug message
 */
export function sendDebugInfo(message: string): void {
  try {
    figma.ui.postMessage({ 
      type: 'debug-info', 
      message 
    });
  } catch (err: unknown) {
    console.log(`DEBUG INFO: ${message}`);
  }
} 