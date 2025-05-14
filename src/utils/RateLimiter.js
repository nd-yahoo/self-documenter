var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * RateLimiter - Manages API request rate to prevent hitting rate limits
 * Limits requests to a configurable number per second
 */
export class RateLimiter {
    constructor(maxRequestsPerSecond = 5) {
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = 0;
        this.requestsInLastSecond = 0;
        this.maxRequestsPerSecond = maxRequestsPerSecond;
    }
    /**
     * Add a function to the rate-limited queue
     * @param fn The function to execute
     * @returns Promise that resolves with the function's result
     */
    add(fn) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.queue.push(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const result = yield fn();
                        resolve(result);
                        return result;
                    }
                    catch (err) {
                        reject(err);
                        throw err;
                    }
                }));
                if (!this.processing) {
                    this.processQueue();
                }
            });
        });
    }
    /**
     * Process the queue of functions with rate limiting
     */
    processQueue() {
        return __awaiter(this, void 0, void 0, function* () {
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
                    yield new Promise(resolve => setTimeout(resolve, waitTime));
                    this.lastRequestTime = Date.now();
                    this.requestsInLastSecond = 0;
                }
            }
            else {
                // New second started
                this.lastRequestTime = now;
                this.requestsInLastSecond = 1;
            }
            const fn = this.queue.shift();
            if (fn) {
                try {
                    yield fn();
                }
                catch (err) {
                    console.error("Error processing queue item:", err);
                }
            }
            // Process next item
            this.processQueue();
        });
    }
}
