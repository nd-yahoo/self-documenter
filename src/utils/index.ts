/**
 * Utility classes for CSV parsing, rate limiting, and memory management
 */

// CSV Utilities
export class CsvUtils {
  /**
   * Parses a CSV string into a 2D array of values
   */
  static parseCSV(csvText: string): string[][] {
    if (!csvText || typeof csvText !== 'string') {
      return [];
    }
    
    const lines = csvText.split(/\r?\n/);
    return lines.map(line => this.parseCSVLine(line));
  }
  
  /**
   * Parses a single CSV line into an array of values
   */
  static parseCSVLine(line: string): string[] {
    if (!line) return [];
    
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current) {
      result.push(current.trim());
    }
    
    return result;
  }
  
  /**
   * Filters rows to ensure the specified column has a value
   */
  static filterRows(rows: string[][], columnIndex: number): string[][] {
    if (!rows || rows.length === 0) return [];
    
    // Keep header row and filter data rows
    const headerRow = rows[0];
    const dataRows = rows.slice(1).filter(row => {
      return columnIndex < row.length && row[columnIndex].trim() !== '';
    });
    
    return [headerRow, ...dataRows];
  }
  
  /**
   * Validates CSV data
   */
  static validateCsvData(csvText: string): { isValid: boolean; error?: string } {
    if (!csvText || typeof csvText !== 'string') {
      return { isValid: false, error: 'CSV data is empty or invalid' };
    }
    
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) {
      return { isValid: false, error: 'CSV must have at least a header row and one data row' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Simple CSV parser that returns headers and rows directly
   */
  static parseSimple(csvText: string): { headers: string[]; rows: string[][] } {
    const parsedData = this.parseCSV(csvText);
    
    if (parsedData.length === 0) {
      return { headers: [], rows: [] };
    }
    
    const headers = parsedData[0];
    const rows = parsedData.slice(1);
    
    return { headers, rows };
  }
}

// Rate limiter for API calls
export class RateLimiter {
  private queue: (() => Promise<any>)[] = [];
  private running = false;
  private requestsPerSecond: number;
  
  constructor(requestsPerSecond: number = 5) {
    this.requestsPerSecond = requestsPerSecond;
  }
  
  /**
   * Add a function to the rate-limited queue
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.running) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Process the queue of functions with rate limiting
   */
  private async processQueue() {
    if (this.queue.length === 0) {
      this.running = false;
      return;
    }
    
    this.running = true;
    const fn = this.queue.shift();
    
    if (fn) {
      try {
        await fn();
      } catch (error) {
        console.error('Error in rate-limited function:', error);
      }
      
      // Wait for the rate limit
      await new Promise(resolve => setTimeout(resolve, 1000 / this.requestsPerSecond));
      
      // Process next item
      this.processQueue();
    }
  }
}

// Memory manager for caching image data
export class MemoryManager {
  private imageCache: Map<string, string> = new Map();
  private maxCacheSize: number;
  
  constructor(maxCacheSize: number = 100) {
    this.maxCacheSize = maxCacheSize;
  }
  
  /**
   * Cache an image hash with a key
   */
  cacheImage(key: string, imageHash: string): void {
    // If cache is full, remove oldest entry
    if (this.imageCache.size >= this.maxCacheSize) {
      const firstKey = this.imageCache.keys().next().value;
      if (firstKey) {
        this.imageCache.delete(firstKey);
      }
    }
    
    this.imageCache.set(key, imageHash);
  }
  
  /**
   * Get an image hash from cache
   */
  getImageHash(key: string): string | undefined {
    return this.imageCache.get(key);
  }
  
  /**
   * Clear the image cache
   */
  clearCache(): void {
    this.imageCache.clear();
  }
  
  /**
   * Get the current cache size
   */
  getCacheSize(): number {
    return this.imageCache.size;
  }
} 