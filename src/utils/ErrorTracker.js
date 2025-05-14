/**
 * ErrorTracker - Tracks and manages error messages
 * Keeps a record of the most recent errors for debugging and reporting
 */
export class ErrorTracker {
    /**
     * Create a new ErrorTracker instance
     * @param maxErrors Maximum number of errors to keep in history
     */
    constructor(maxErrors = 20) {
        this.errors = [];
        this.maxErrors = maxErrors;
    }
    /**
     * Add an error to the tracker
     * @param message Error message to track
     */
    addError(message) {
        this.errors.push({
            message,
            timestamp: Date.now()
        });
        // Keep only the most recent errors
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }
    }
    /**
     * Get a formatted summary of recent errors
     * @returns String with error summary
     */
    getErrorSummary() {
        if (this.errors.length === 0) {
            return "No errors recorded";
        }
        return this.errors.map(err => {
            const date = new Date(err.timestamp);
            return `[${date.toLocaleTimeString()}] ${err.message}`;
        }).join('\n');
    }
    /**
     * Check if there are any errors recorded
     * @returns True if errors exist
     */
    hasErrors() {
        return this.errors.length > 0;
    }
    /**
     * Get the total number of tracked errors
     * @returns Number of errors
     */
    getErrorCount() {
        return this.errors.length;
    }
}
