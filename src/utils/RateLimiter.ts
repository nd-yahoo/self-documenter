/**
 * RateLimiter - Manages API request rate to prevent hitting rate limits
 * Limits requests to a configurable number per second
 */
export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestsInLastSecond = 0;
  private readonly maxRequestsPerSecond: number;

  constructor(maxRequestsPerSecond = 5) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  /**
   * Add a function to the rate-limited queue
   * @param fn The function to execute
   * @returns Promise that resolves with the function's result
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
          return result;
        } catch (err) {
          reject(err);
          throw err;
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue of functions with rate limiting
   */
  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    
    // Rate limiting logic
    const now = Date.now();
    if (now - this.lastRequestTime < 1000) {
      // Still within the same second
      this.requestsInLastSecond++;
      if (this.requestsInLastSecond >= this.maxRequestsPerSecond) {
        // Wait until the next second
        const waitTime = 1000 - (now - this.lastRequestTime);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.lastRequestTime = Date.now();
        this.requestsInLastSecond = 0;
      }
    } else {
      // New second started
      this.lastRequestTime = now;
      this.requestsInLastSecond = 1;
    }

    const fn = this.queue.shift();
    if (fn) {
      try {
        await fn();
      } catch (err) {
        console.error("Error processing queue item:", err);
      }
    }

    // Process next item
    this.processQueue();
  }
} 