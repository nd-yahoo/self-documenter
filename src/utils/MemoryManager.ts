/**
 * MemoryManager - Manages image cache to optimize memory usage
 * Controls the number of images kept in memory and implements TTL-based cleanup
 */
export class MemoryManager {
  private imageCache: Map<string, { hash: string, lastUsed: number }> = new Map();
  private readonly maxCacheSize: number;
  private readonly cacheTTL: number;
  
  /**
   * Create a new MemoryManager instance
   * @param maxCacheSize Maximum number of images to keep in memory
   * @param cacheTTL Time in ms to keep unused images in cache
   */
  constructor(maxCacheSize = 50, cacheTTL = 60000) {
    this.maxCacheSize = maxCacheSize;
    this.cacheTTL = cacheTTL; // Default: 1 minute
  }
  
  /**
   * Add an image to the cache
   * @param imageId Unique identifier for the image
   * @param imageHash Figma image hash
   */
  cacheImage(imageId: string, imageHash: string): void {
    this.imageCache.set(imageId, {
      hash: imageHash,
      lastUsed: Date.now()
    });
    
    // Clean up old entries if we exceed the cache size
    if (this.imageCache.size > this.maxCacheSize) {
      this.cleanCache();
    }
  }
  
  /**
   * Get an image hash from the cache
   * @param imageId Unique identifier for the image
   * @returns The image hash or null if not found
   */
  getImageHash(imageId: string): string | null {
    const entry = this.imageCache.get(imageId);
    if (!entry) return null;
    
    // Update the last used timestamp
    entry.lastUsed = Date.now();
    return entry.hash;
  }
  
  /**
   * Clean up the cache by removing old entries
   */
  cleanCache(): void {
    const now = Date.now();
    
    // First, remove entries that exceed the TTL
    for (const [id, entry] of this.imageCache.entries()) {
      if (now - entry.lastUsed > this.cacheTTL) {
        this.imageCache.delete(id);
      }
    }
    
    // If we still have too many entries, remove the oldest ones
    if (this.imageCache.size > this.maxCacheSize) {
      const entries = Array.from(this.imageCache.entries())
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      
      // Remove the oldest entries
      const entriesToRemove = entries.slice(0, entries.length - this.maxCacheSize);
      for (const [id] of entriesToRemove) {
        this.imageCache.delete(id);
      }
    }
  }
  
  /**
   * Get memory usage statistics
   * @returns Object with cache statistics
   */
  getStats(): { cacheSize: number, entryCount: number } {
    return {
      cacheSize: this.imageCache.size,
      entryCount: this.imageCache.size
    };
  }
} 