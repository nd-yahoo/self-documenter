// This file holds the main code for the CSV to Screenshots Figma plugin
// The plugin imports a CSV file, takes a query column, runs screenshots, and embeds them in Figma

// Types for our CSV data
interface QueryColumn {
  index: number;
  name: string;
}

interface AdditionalColumn {
  index: number;
  name: string;
}

interface ScreenshotData {
  query: string;
  imageBytes: Uint8Array;
  filename: string;
  engine?: string;
  originalWidth?: number;
  originalHeight?: number;
}

interface PluginMessage {
  type: string;
  csvData?: string;
  queryColumn?: QueryColumn;
  additionalColumns?: AdditionalColumn[];
  deviceMode?: string;
  count?: number;
  yahooScreenshots?: ScreenshotData[];
  competitorScreenshots?: ScreenshotData[];
  competitorEngine?: string;
}

// Constants
const CARD_WIDTH = 800;
const CARD_HEIGHT = 600;
const CARD_PADDING = 40;
const SCREENSHOT_WIDTH = 360;
const SCREENSHOT_HEIGHT = 480;
const TEXT_WIDTH = 400;
const TEXT_OFFSET_X = SCREENSHOT_WIDTH + 40;
const GRID_SPACING = 40;
const CARDS_PER_ROW = 4;
const ROW_HEIGHT = CARD_HEIGHT + GRID_SPACING;
const TEXT_FONT_SIZE = 16;
const TITLE_FONT_SIZE = 24;
// Figma image size constraints
const MAX_IMAGE_SIZE = 2097152; // 2MB in bytes (Figma limit)
const MAX_IMAGE_DIMENSION = 4096; // Maximum dimension for Figma images

// Rate limiting for Figma API (max 5 requests per second)
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestsInLastSecond = 0;
  private readonly maxRequestsPerSecond = 5;

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

// Create a global rate limiter instance
const figmaApiLimiter = new RateLimiter();

// Memory management utilities
class MemoryManager {
  private imageCache: Map<string, { hash: string, lastUsed: number }> = new Map();
  private readonly maxCacheSize = 50; // Maximum number of image references to keep in memory
  private readonly cacheTTL = 60000; // Time in ms to keep unused images in cache (1 minute)
  
  // Add an image to the cache
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
  
  // Get an image from the cache
  getImageHash(imageId: string): string | null {
    const entry = this.imageCache.get(imageId);
    if (!entry) return null;
    
    // Update the last used timestamp
    entry.lastUsed = Date.now();
    return entry.hash;
  }
  
  // Clean up the cache
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
  
  // Get memory usage statistics
  getStats(): { cacheSize: number, entryCount: number } {
    return {
      cacheSize: this.imageCache.size,
      entryCount: this.imageCache.size
    };
  }
}

// Create a global memory manager
const memoryManager = new MemoryManager();

// Helper function to create an image from bytes with memory management
async function createFigmaImageWithMemoryManagement(
  imageBytes: Uint8Array, 
  imageId: string
): Promise<Image> {
  try {
    // Check if we already have this image in the cache
    const cachedHash = memoryManager.getImageHash(imageId);
    if (cachedHash) {
      // We can't directly return just the hash - we need a full Image object
      // Since we can't reconstruct the full Image object, we'll have to create a new one
      console.log(`Image cache hit for ${imageId}, but we need to create a new Image object`);
    }
    
    // Create a new image
    const image = figma.createImage(imageBytes);
    
    // Cache the image hash for potential reuse
    memoryManager.cacheImage(imageId, image.hash);
    
    return image;
  } catch (err: unknown) {
    console.error(`Error creating image: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Helper function to resize image bytes to fit Figma's constraints
async function resizeImageBytes(imageBytes: Uint8Array, filename: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      // Create a blob from the byte array
      const blob = new Blob([imageBytes], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      
      // Create an image to load the blob
      const img = new Image();
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // Check if resize is needed based on dimensions
        const needsResize = img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION || imageBytes.length > MAX_IMAGE_SIZE;
        
        if (!needsResize) {
          resolve(imageBytes);
          return;
        }
        
        // Calculate new dimensions while maintaining aspect ratio
        let newWidth, newHeight;
        if (img.width > img.height) {
          newWidth = Math.min(img.width, MAX_IMAGE_DIMENSION);
          newHeight = Math.round((newWidth / img.width) * img.height);
        } else {
          newHeight = Math.min(img.height, MAX_IMAGE_DIMENSION);
          newWidth = Math.round((newHeight / img.height) * img.width);
        }
        
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Draw the image on the canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Failed to get 2D context for canvas');
          resolve(imageBytes); // Return original as fallback
          return;
        }
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        // Convert to blob with reduced quality for JPEGs
        const isJpeg = filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg');
        
        canvas.toBlob(blob => {
          if (!blob) {
            console.error(`Failed to create blob for ${filename}`);
            resolve(imageBytes); // Return original as fallback
            return;
          }
          
          // Convert blob to array buffer
          const reader = new FileReader();
          reader.onload = function() {
            const buffer = reader.result as ArrayBuffer;
            resolve(new Uint8Array(buffer));
          };
          reader.onerror = function() {
            console.error(`Error reading resized blob for ${filename}`);
            resolve(imageBytes); // Return original as fallback
          };
          reader.readAsArrayBuffer(blob);
        }, isJpeg ? 'image/jpeg' : 'image/png', 0.8); // Use 80% quality to reduce size
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        console.error(`Failed to load image for resizing: ${filename}`);
        resolve(imageBytes); // Return original as fallback
      };
      
      img.src = url;
    } catch (err: unknown) {
      console.error(`Error in resizeImageBytes: ${err instanceof Error ? err.message : String(err)}`);
      resolve(imageBytes); // Return original as fallback
    }
  });
}

// Process image before sending to Figma
async function processFigmaImage(imageData: ScreenshotData): Promise<ScreenshotData> {
  try {
    // Check if the image data is too large
    if (imageData.imageBytes.length > MAX_IMAGE_SIZE) {
      console.log(`Image too large (${(imageData.imageBytes.length / 1024 / 1024).toFixed(2)}MB), resizing: ${imageData.filename}`);
      
      // Resize the image
      const resizedBytes = await resizeImageBytes(imageData.imageBytes, imageData.filename);
      
      // Return resized image data
      return {
        ...imageData,
        imageBytes: resizedBytes,
        filename: imageData.filename + " (resized)"
      };
    }
    
    // Image is within size limits, return as is
    return imageData;
  } catch (err: unknown) {
    console.error(`Error processing image ${imageData.filename}: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Helper function to ensure we're working with the current page
async function getCurrentPage(): Promise<PageNode> {
  // If we're not on a page node, find the current page
  if (figma.currentPage.type !== "PAGE") {
    console.warn("Current context is not a page, finding the first available page");
    
    // Get all pages
    const pages = figma.root.children;
    if (pages.length === 0) {
      // This should never happen, but just in case
      console.error("No pages found in document");
      throw new Error("No pages found in document");
    }
    
    // Return the first page
    return pages[0];
  }
  
  return figma.currentPage;
}

// Main plugin code
try {
  // Create a text node directly on startup to confirm plugin is loading
  const debugNode = figma.createText();
  figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(() => {
    debugNode.fontName = { family: "Inter", style: "Regular" };
    debugNode.fontSize = 14;
    debugNode.characters = "CSV Plugin Debug: Plugin loaded successfully at " + new Date().toLocaleTimeString();
    debugNode.resize(400, 50);
    figma.currentPage.appendChild(debugNode);
    figma.currentPage.selection = [debugNode];
    figma.viewport.scrollAndZoomIntoView([debugNode]);
  });
  
  // Show UI
  figma.showUI(__html__, { width: 480, height: 580 });
} catch (err) {
  console.error("Plugin initialization failed:", err);
  figma.notify("Plugin initialization failed: " + (err as Error).message);
}

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'process-csv') {
    try {
      // Show debugging info about the query column and CSV data
      const csvData = msg.csvData || '';
      const queryColumn = msg.queryColumn || { index: 0, name: '' };
      const yahooScreenshots = msg.yahooScreenshots || [];
      const competitorScreenshots = msg.competitorScreenshots || [];
      const competitorEngine = msg.competitorEngine || 'unknown';
      
      // Log screenshot info
      if (yahooScreenshots.length > 0 || competitorScreenshots.length > 0) {
        console.log(`Received ${yahooScreenshots.length} Yahoo screenshots and ${competitorScreenshots.length} competitor screenshots`);
      }
      
      // Create a text node with debug information about the query column
      const textNode = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      textNode.fontName = { family: "Inter", style: "Regular" };
      textNode.fontSize = 10;
      
      // Create a simple representation of the data with manual CSV parsing
      const lines = csvData.split('\n').filter(line => line.trim() !== '');
      const headers = lines[0].split(',');
      const queryColIndex = queryColumn.index;
      
      // Create debug text
      textNode.characters = 
        `CSV COLUMN DEBUG\n` +
        `Query column index: ${queryColIndex}\n` +
        `Query column name: ${queryColumn.name}\n` +
        `Headers: ${JSON.stringify(headers)}\n` +
        `Header at queryColumn.index: "${queryColIndex < headers.length ? headers[queryColIndex] : 'OUT OF BOUNDS'}"\n\n` +
        `First 3 data rows (${lines.length - 1} total rows):\n`;
      
      // Add the first few data rows for reference
      for (let i = 1; i < Math.min(4, lines.length); i++) {
        const cells = lines[i].split(',');
        const queryVal = queryColIndex < cells.length ? cells[queryColIndex] : 'OUT OF BOUNDS';
        textNode.characters += `Row ${i}: Query value = "${queryVal}"\n`;
      }
      
      // Add screenshot info
      const totalScreenshots = yahooScreenshots.length + competitorScreenshots.length;
      if (totalScreenshots > 0) {
        textNode.characters += `\nScreenshots: ${totalScreenshots} uploaded (${yahooScreenshots.length} Yahoo, ${competitorScreenshots.length} ${competitorEngine})\n`;
        // Show sample of Yahoo screenshots
        if (yahooScreenshots.length > 0) {
          textNode.characters += `\nYahoo Screenshots:\n`;
          for (let i = 0; i < Math.min(2, yahooScreenshots.length); i++) {
            textNode.characters += `  ${i+1}: "${yahooScreenshots[i].query}" (${yahooScreenshots[i].filename})\n`;
          }
        }
        // Show sample of competitor screenshots
        if (competitorScreenshots.length > 0) {
          textNode.characters += `\n${competitorEngine.charAt(0).toUpperCase() + competitorEngine.slice(1)} Screenshots:\n`;
          for (let i = 0; i < Math.min(2, competitorScreenshots.length); i++) {
            textNode.characters += `  ${i+1}: "${competitorScreenshots[i].query}" (${competitorScreenshots[i].filename})\n`;
          }
        }
      }
      
      textNode.resize(400, 300);
      figma.currentPage.appendChild(textNode);
      
      // Select the text node and focus on it
      figma.currentPage.selection = [textNode];
      figma.viewport.scrollAndZoomIntoView([textNode]);
      
      figma.notify('Query column debug info created on canvas');
      
      // Now actually process the CSV with a modified version that ignores the validation error
      await processCSVModified(
        csvData,
        queryColumn,
        msg.additionalColumns || [],
        msg.deviceMode || 'mobile',
        yahooScreenshots,
        competitorScreenshots,
        competitorEngine
      );
      
    } catch (error) {
      console.error('Error processing CSV:', error);
      figma.notify('Error processing CSV: ' + (error as Error).message);
      figma.closePlugin();
    }
  }
};

// Parse CSV data
function parseCSV(csvData: string): string[][] {
  // Try the simplest approach first - this often works when there are no complex fields
  try {
    // Split by lines and filter out empties
    const lines = csvData.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      console.error("Not enough lines in CSV data - need at least headers and one data row");
      return [];
    }
    
    // Use a very simple parsing approach first
    const simpleResult = lines.map(line => {
      // Just split by commas - this works for simple CSVs
      return line.split(',').map(cell => cell.trim());
    });
    
    return simpleResult;
  } catch (err) {
    console.error("Simple CSV parsing failed, falling back to more robust method:", err);
    
    // Fallback to a more sophisticated approach
    try {
      const lines = csvData.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        console.error("Not enough lines in CSV data");
        return [];
      }
      
      const parseRow = (row: string): string[] => {
        const cells: string[] = [];
        let currentCell = '';
        let inQuotes = false;
        
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            cells.push(currentCell.trim());
            currentCell = '';
          } else {
            currentCell += char;
          }
        }
        
        cells.push(currentCell.trim());
        return cells;
      };
      
      return lines.map(line => parseRow(line));
    } catch (err2) {
      console.error("Both CSV parsing methods failed:", err2);
      
      // Last resort fallback
      return csvData.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.split(','));
    }
  }
}

// Main processing function
async function processCSV(
  csvData: string,
  queryColumn: QueryColumn,
  additionalColumns: AdditionalColumn[],
  searchEngine: string,
  deviceMode: string
) {
  // Parse CSV
  figma.ui.postMessage({ type: 'update-progress', message: 'Parsing CSV data...' });
  
  // Send debug info back to UI
  const sendDebugInfo = (message: string) => {
    figma.ui.postMessage({ 
      type: 'debug-info', 
      message: message
    });
  };
  
  // Process the CSV data with better error handling
  if (!csvData || csvData.trim() === '') {
    sendDebugInfo("ERROR: Empty CSV data received");
    figma.notify('Empty CSV data received');
    figma.closePlugin();
    return;
  }
  
  sendDebugInfo(`CSV data received: ${csvData.length} characters`);
  sendDebugInfo(`First 50 chars: ${csvData.substring(0, 50)}`);
  
  const parsedData = parseCSV(csvData);
  
  sendDebugInfo(`Parsed data rows: ${parsedData.length}`);
  if (parsedData.length > 0) {
    sendDebugInfo(`Header row has ${parsedData[0].length} columns`);
    sendDebugInfo(`Headers: ${JSON.stringify(parsedData[0])}`);
  }
  if (parsedData.length > 1) {
    sendDebugInfo(`First data row has ${parsedData[1].length} columns`);
    sendDebugInfo(`Data: ${JSON.stringify(parsedData[1])}`);
  }
  
  // Check if we have enough data (headers + at least one row)
  if (parsedData.length < 2) {
    sendDebugInfo("ERROR: Not enough rows in parsed data");
    figma.notify('CSV file must have headers and at least one data row');
    figma.closePlugin();
    return;
  }
  
  // Get headers and data rows
  const headers = parsedData[0];
  sendDebugInfo(`Headers: ${JSON.stringify(headers)}`);
  sendDebugInfo(`Query column index: ${queryColumn.index}`);
  sendDebugInfo(`Query column name: ${queryColumn.name}`);
  
  // Filter rows with detailed debugging
  const dataRows = [];
  for (let i = 1; i < parsedData.length; i++) {
    const row = parsedData[i];
    sendDebugInfo(`Checking row ${i}: ${JSON.stringify(row)}`);
    
    if (row.length <= queryColumn.index) {
      sendDebugInfo(`Row ${i} skipped: Not enough columns (has ${row.length}, needs >${queryColumn.index})`);
      continue;
    }
    
    if (row[queryColumn.index].trim() === '') {
      sendDebugInfo(`Row ${i} skipped: Empty query column value`);
      continue;
    }
    
    sendDebugInfo(`Row ${i} accepted: Query value = "${row[queryColumn.index]}"`);
    dataRows.push(row);
  }
  
  sendDebugInfo(`Total accepted data rows: ${dataRows.length}`);
  
  if (dataRows.length === 0) {
    sendDebugInfo("ERROR: No valid data rows found after filtering");
    figma.notify('No valid data rows found in CSV');
    figma.closePlugin();
    return;
  }
  
  // Load fonts
  figma.ui.postMessage({ type: 'update-progress', message: 'Loading fonts...' });
  try {
    await Promise.all([
      figma.loadFontAsync({ family: "Inter", style: "Regular" }),
      figma.loadFontAsync({ family: "Inter", style: "Bold" })
    ]);
    figma.ui.postMessage({ type: 'update-progress', message: 'Fonts loaded successfully' });
  } catch (err: unknown) {
    console.error(`Error loading fonts: ${err instanceof Error ? err.message : String(err)}`);
    figma.ui.postMessage({ 
      type: 'update-progress', 
      message: 'Warning: Some fonts failed to load, text may not display correctly' 
    });
    // Continue execution - we'll try to use system fonts as fallback
  }
  
  // Create frame to hold all cards
  const mainFrame = figma.createFrame();
  mainFrame.name = "CSV Screenshots";
  mainFrame.resize(CARD_WIDTH, dataRows.length * ROW_HEIGHT);
  mainFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  
  // For each query, run screenshot and create card
  for (let i = 0; i < dataRows.length; i++) {
    figma.ui.postMessage({ 
      type: 'update-progress', 
      message: `Processing row ${i + 1} of ${dataRows.length}...` 
    });
    
    const row = dataRows[i];
    const rowQueryValue = queryColumn.index < row.length ? row[queryColumn.index].trim() : "";
    const query = rowQueryValue || `Row ${i+1} Query`; // Use row number as fallback if empty
    
    if (!query) continue;
    
    // Create card container
    const card = figma.createFrame();
    card.name = `Query: ${query}`;
    card.resize(CARD_WIDTH, CARD_HEIGHT);
    card.x = 0;
    card.y = i * ROW_HEIGHT;
    card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    card.cornerRadius = 8;
    card.effects = [
      {
        type: 'DROP_SHADOW',
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        offset: { x: 0, y: 2 },
        radius: 4,
        visible: true,
        blendMode: 'NORMAL'
      }
    ];
    
    // Get screenshot
    const screenshotUrl = getSearchUrl(query, searchEngine);
    
    // Create screenshot placeholder rectangle
    const screenshotFrame = figma.createFrame();
    screenshotFrame.name = "Screenshot";
    screenshotFrame.resize(SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT);
    screenshotFrame.x = CARD_PADDING;
    screenshotFrame.y = CARD_PADDING;
    screenshotFrame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    
    // Add placeholder text in the screenshot frame
    const placeholderText = figma.createText();
    placeholderText.characters = "Screenshot will be added when using online version";
    placeholderText.fontSize = 14;
    placeholderText.x = 10;
    placeholderText.y = SCREENSHOT_HEIGHT / 2 - 20;
    placeholderText.resize(SCREENSHOT_WIDTH - 20, 40);
    placeholderText.textAlignHorizontal = 'CENTER';
    placeholderText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    screenshotFrame.appendChild(placeholderText);
    
    // Add URL text below the screenshot
    const urlText = figma.createText();
    urlText.characters = screenshotUrl;
    urlText.fontSize = 10;
    urlText.x = CARD_PADDING;
    urlText.y = CARD_PADDING + SCREENSHOT_HEIGHT + 8;
    urlText.resize(SCREENSHOT_WIDTH, 16);
    urlText.textAlignHorizontal = 'LEFT';
    urlText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    
    // Create a section for the query text
    const queryText = figma.createText();
    queryText.characters = "Search Query:";
    queryText.fontSize = TITLE_FONT_SIZE;
    queryText.fontName = { family: "Inter", style: "Bold" };
    queryText.x = CARD_PADDING + TEXT_OFFSET_X;
    queryText.y = CARD_PADDING;
    queryText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
    
    // Add the actual query value
    const queryValue = figma.createText();
    queryValue.characters = query;
    queryValue.fontSize = TEXT_FONT_SIZE;
    queryValue.x = CARD_PADDING + TEXT_OFFSET_X;
    queryValue.y = CARD_PADDING + TITLE_FONT_SIZE + 10;
    queryValue.resize(TEXT_WIDTH - 40, 40);
    queryValue.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    
    // Add the additional column data
    let yOffset = CARD_PADDING + TITLE_FONT_SIZE + 60;
    
    if (additionalColumns.length > 0) {
      const additionalDataTitle = figma.createText();
      additionalDataTitle.characters = "Additional Data:";
      additionalDataTitle.fontSize = TITLE_FONT_SIZE;
      additionalDataTitle.fontName = { family: "Inter", style: "Bold" };
      additionalDataTitle.x = CARD_PADDING + TEXT_OFFSET_X;
      additionalDataTitle.y = yOffset;
      additionalDataTitle.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
      yOffset += TITLE_FONT_SIZE + 10;
      
      for (const column of additionalColumns) {
        if (column.index < row.length) {
          const data = row[column.index];
          
          const columnTitle = figma.createText();
          columnTitle.characters = column.name + ":";
          columnTitle.fontSize = TEXT_FONT_SIZE;
          columnTitle.fontName = { family: "Inter", style: "Bold" };
          columnTitle.x = CARD_PADDING + TEXT_OFFSET_X;
          columnTitle.y = yOffset;
          columnTitle.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
          
          const columnValue = figma.createText();
          columnValue.characters = data;
          columnValue.fontSize = TEXT_FONT_SIZE;
          columnValue.x = CARD_PADDING + TEXT_OFFSET_X;
          columnValue.y = yOffset + TEXT_FONT_SIZE + 4;
          columnValue.resize(TEXT_WIDTH - 40, 40);
          columnValue.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
          
          card.appendChild(columnTitle);
          card.appendChild(columnValue);
          
          yOffset += TEXT_FONT_SIZE * 2 + 16;
        }
      }
      
      card.appendChild(additionalDataTitle);
    }
    
    // Add search engine and device mode info
    const metaInfo = figma.createText();
    metaInfo.characters = `Engine: ${searchEngine.charAt(0).toUpperCase() + searchEngine.slice(1)} | Mode: ${deviceMode.charAt(0).toUpperCase() + deviceMode.slice(1)}`;
    metaInfo.fontSize = 12;
    metaInfo.x = CARD_PADDING + TEXT_OFFSET_X;
    metaInfo.y = CARD_HEIGHT - CARD_PADDING - 16;
    metaInfo.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    
    // Add all elements to the card
    card.appendChild(screenshotFrame);
    card.appendChild(urlText);
    card.appendChild(queryText);
    card.appendChild(queryValue);
    card.appendChild(metaInfo);
    
    // Add card to main frame
    mainFrame.appendChild(card);
  }
  
  // Add the main frame to the Figma document
  figma.currentPage.appendChild(mainFrame);
  
  // Select the main frame and zoom to it
  figma.currentPage.selection = [mainFrame];
  figma.viewport.scrollAndZoomIntoView([mainFrame]);
  
  // Notify completion
  figma.notify('CSV screenshots imported successfully!');
  
  // Close the plugin
  figma.closePlugin();
}

// Helper function to create a screenshot section (Yahoo or competitor)
async function createScreenshotSection(
  query: string,
  engineName: string, 
  screenshotsByQuery: Map<string, ScreenshotData>,
  x: number, 
  y: number,
  width: number, // Target final visual width (e.g., 200)
  height: number, // Target final visual height (e.g., 872)
  padding: number // This was CARD_PADDING, likely not used directly for section's internal styling now
): Promise<FrameNode> {
  const BORDER_THICKNESS = 2;
  const BORDER_COLOR = { r: 0.5, g: 0.5, b: 0.5 }; // #808080

  // Calculate the section's own dimensions so that with an OUTSIDE border,
  // the total visual dimensions match the input 'width' and 'height'.
  const sectionActualWidth = width - 2 * BORDER_THICKNESS; // e.g., 200 - 4 = 196
  const sectionActualHeight = height - 2 * BORDER_THICKNESS; // e.g., 872 - 4 = 868

  // Create the main section frame
  const section = figma.createFrame();
  section.name = `${engineName} Screenshot Section`;
  section.resize(sectionActualWidth, sectionActualHeight);
  section.x = x;
  section.y = y;
  
  section.clipsContent = true;

  // Autolayout setup
  section.layoutMode = "VERTICAL";
  section.primaryAxisSizingMode = "FIXED";   // Explicitly fixed height
  section.counterAxisSizingMode = "FIXED";  // Explicitly fixed width
  section.primaryAxisAlignItems = "MIN";    // Align children to the top
  section.counterAxisAlignItems = "CENTER"; // Corrected from STRETCH. Children will stretch themselves.
  
  // Padding inside the section frame. Since title is removed, top padding can be 0.
  section.paddingTop = 0; 
  section.paddingLeft = 0;
  section.paddingRight = 0;
  section.paddingBottom = 0; 
  section.itemSpacing = 0;   // No spacing needed for a single child (image or placeholder)

  // Corner radius
  section.topLeftRadius = 16;
  section.topRightRadius = 16;
  section.bottomLeftRadius = 0; 
  section.bottomRightRadius = 0;

  // Border
  section.strokes = [{ type: 'SOLID', color: BORDER_COLOR }];
  section.strokeWeight = BORDER_THICKNESS;
  section.strokeAlign = "OUTSIDE"; // Border is drawn outside the 196x868 box

  const screenshot = screenshotsByQuery.get(query.toLowerCase().trim());
  
  if (screenshot) {
    section.fills = []; // Clear section background if image is present

    const imageContainer = figma.createRectangle();
    imageContainer.name = `${engineName} Image Container`;
    imageContainer.layoutAlign = "STRETCH"; 
    imageContainer.layoutGrow = 1; // Take remaining vertical space
    
    try {
      const image = figma.createImage(screenshot.imageBytes);
      if (screenshot.originalWidth && screenshot.originalWidth > 0) {
        const W_orig = screenshot.originalWidth;
        // Image content width is the actual width of the imageContainer.
        // imageContainer's width will be sectionActualWidth - section.paddingLeft - section.paddingRight
        const imageRenderWidth = sectionActualWidth - section.paddingLeft - section.paddingRight;
        const scaleFactor = imageRenderWidth / W_orig;

        imageContainer.fills = [{
          type: 'IMAGE',
          scaleMode: 'CROP',
          imageHash: image.hash,
          imageTransform: [[scaleFactor, 0, 0], [0, scaleFactor, 0]]
        }];
      } else {
        console.warn(`Original width not available for ${screenshot.filename}. Using 'FILL' mode.`);
        imageContainer.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
      }
    } catch (err: any) {
      console.error(`Error creating or applying image for "${query}":`, err);
      // In case of error creating image fill, make imageContainer show an error color.
      imageContainer.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.7, b: 0.7 } }]; // Light red for error
    }
    section.appendChild(imageContainer);
  } else {
    // No matching screenshot, setup placeholder appearance for section
    section.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }]; // Background for placeholder

    const noImageText = figma.createText();
    noImageText.name = "Placeholder Text";
    try {
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        noImageText.fontName = { family: "Inter", style: "Regular" };
    } catch (e) { console.warn("Failed to load font for placeholder", e); }
    noImageText.characters = `No ${engineName} screenshot available for query: "${query}"`;
    noImageText.fontSize = 14;
    noImageText.textAlignHorizontal = 'CENTER';
    noImageText.textAlignVertical = 'CENTER';
    noImageText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    
    noImageText.layoutAlign = 'STRETCH'; // Ensure placeholder also stretches
    noImageText.layoutGrow = 1; // To fill the space
    section.appendChild(noImageText);
  }
  
  return section;
}

// Modified process function that creates side-by-side comparison cards
async function processCSVModified(
  csvData: string,
  queryColumn: QueryColumn,
  additionalColumns: AdditionalColumn[],
  deviceMode: string,
  yahooScreenshots: ScreenshotData[],
  competitorScreenshots: ScreenshotData[],
  competitorEngine: string
) {
  // Parse CSV with a very simple approach
  figma.ui.postMessage({ type: 'update-progress', message: 'Parsing CSV data...' });
  
  // Simple CSV parsing without validation errors
  const lines = csvData.split('\n').filter(line => line.trim() !== '');
  // const headers = lines[0].split(','); // Headers not directly used in this simplified version
  
  // Create data rows directly - skip all the validation that was causing problems
  const dataRows = lines.slice(1).map(line => line.split(','));
  
  figma.ui.postMessage({ type: 'update-progress', message: `Found ${dataRows.length} data rows` });
  
  // Process and resize images before indexing
  figma.ui.postMessage({ type: 'update-progress', message: 'Processing Yahoo screenshots...' });
  const processedYahooScreenshots: ScreenshotData[] = [];
  for (const screenshot of yahooScreenshots) {
    try {
      const processed = await processFigmaImage(screenshot);
      processedYahooScreenshots.push(processed);
    } catch (err: unknown) {
      console.error(`Failed to process Yahoo screenshot for query "${screenshot.query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  
  figma.ui.postMessage({ type: 'update-progress', message: 'Processing competitor screenshots...' });
  const processedCompetitorScreenshots: ScreenshotData[] = [];
  for (const screenshot of competitorScreenshots) {
    try {
      const processed = await processFigmaImage(screenshot);
      processedCompetitorScreenshots.push(processed);
    } catch (err: unknown) {
      console.error(`Failed to process ${competitorEngine} screenshot for query "${screenshot.query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  
  // Index screenshots by query for quick lookup
  const yahooScreenshotsByQuery = new Map<string, ScreenshotData>();
  for (const screenshot of processedYahooScreenshots) {
    yahooScreenshotsByQuery.set(screenshot.query.toLowerCase().trim(), screenshot);
  }
  
  const competitorScreenshotsByQuery = new Map<string, ScreenshotData>();
  for (const screenshot of processedCompetitorScreenshots) {
    competitorScreenshotsByQuery.set(screenshot.query.toLowerCase().trim(), screenshot);
  }
  
  // Build a set of all unique queries found in either screenshot set
  const allQueries = new Set<string>();
  processedYahooScreenshots.forEach(screenshot => allQueries.add(screenshot.query.toLowerCase().trim()));
  processedCompetitorScreenshots.forEach(screenshot => allQueries.add(screenshot.query.toLowerCase().trim()));
  
  // Load fonts
  figma.ui.postMessage({ type: 'update-progress', message: 'Loading fonts...' });
  try {
    await Promise.all([
      figma.loadFontAsync({ family: "Inter", style: "Regular" }),
      figma.loadFontAsync({ family: "Inter", style: "Bold" })
    ]);
    figma.ui.postMessage({ type: 'update-progress', message: 'Fonts loaded successfully' });
  } catch (err: unknown) {
    console.error(`Error loading fonts: ${err instanceof Error ? err.message : String(err)}`);
    figma.ui.postMessage({ 
      type: 'update-progress', 
      message: 'Warning: Some fonts failed to load, text may not display correctly' 
    });
  }
  
  // Card and screenshot dimensions
  const COMPARISON_CARD_WIDTH = 880;
  const COMPARISON_CARD_HEIGHT = 1040; // This might be overridden by autolayout height if not fixed
  const SCREENSHOT_CONTAINER_WIDTH = 200; // Visual width of each screenshot component
  const SCREENSHOT_CONTAINER_HEIGHT = 906; // Visual height of each screenshot component
  const SCREENSHOT_SPACING = 40; // Horizontal spacing between screenshots
  const CARD_INTERNAL_PADDING = 40; // Padding inside the main card
  const VERTICAL_SPACING_IN_CARD = 40; // Spacing between vertical elements in the card

  // Calculate grid dimensions
  const totalCards = allQueries.size;
  // const CARDS_PER_ROW = 4; // Display 4 comparison cards per row (This might be adjusted based on card width)
  const MAIN_FRAME_GRID_SPACING = 100;

  // Create frame to hold all cards
  const mainFrame = figma.createFrame();
  mainFrame.name = "Search Engine Comparisons";
  mainFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  mainFrame.layoutMode = "NONE"; // Changed to NONE for manual positioning of cards
  
  // Calculate width for 4 cards per row
  const numCardsPerRow = 4;
  const mainFrameInternalContentWidth = (numCardsPerRow * COMPARISON_CARD_WIDTH) + ((numCardsPerRow - 1) * MAIN_FRAME_GRID_SPACING);
  
  // Ensure all paddings are set before calculating total width for resize
  mainFrame.paddingLeft = MAIN_FRAME_GRID_SPACING;
  mainFrame.paddingRight = MAIN_FRAME_GRID_SPACING; // Restore this
  mainFrame.paddingTop = MAIN_FRAME_GRID_SPACING;    // Restore this
  mainFrame.paddingBottom = MAIN_FRAME_GRID_SPACING; // Restore this
  mainFrame.clipsContent = false;                    // Restore this

  const totalMainFrameWidth = mainFrameInternalContentWidth + mainFrame.paddingLeft + mainFrame.paddingRight;
  mainFrame.resize(totalMainFrameWidth, 0); // Set fixed total width, height is auto

  mainFrame.primaryAxisSizingMode = "FIXED"; // Width is fixed
  mainFrame.counterAxisSizingMode = "FIXED"; // Height is now fixed (from previous step)
  
  const uniqueQueries = Array.from(allQueries);
  
  for (let i = 0; i < uniqueQueries.length; i++) {
    figma.ui.postMessage({ 
      type: 'update-progress', 
      message: `Processing comparison ${i + 1} of ${uniqueQueries.length}...` 
    });
    
    const query = uniqueQueries[i];

    // Create TOP-LEVEL CARD container
    const card = figma.createFrame();
    card.name = `Comparison Card: ${query}`;
    card.resize(COMPARISON_CARD_WIDTH, COMPARISON_CARD_HEIGHT); 

    // Calculate grid position for the card
    const colIndex = i % numCardsPerRow; // numCardsPerRow is defined above for mainFrame sizing
    const rowIndex = Math.floor(i / numCardsPerRow);

    card.x = mainFrame.paddingLeft + colIndex * (COMPARISON_CARD_WIDTH + MAIN_FRAME_GRID_SPACING);
    card.y = mainFrame.paddingTop + rowIndex * (COMPARISON_CARD_HEIGHT + MAIN_FRAME_GRID_SPACING);
    
    card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    card.cornerRadius = 8;
    card.effects = [
      {
        type: 'DROP_SHADOW',
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        offset: { x: 0, y: 2 },
        radius: 4,
        visible: true,
        blendMode: 'NORMAL'
      }
    ];

    // Autolayout for the card itself (Top-Level Card Container)
    card.layoutMode = "VERTICAL"; // Ensures children stack vertically
    // layoutWrap is not applicable to vertical layout, so ensure it's not set or is commented out.
    card.primaryAxisAlignItems = "MIN"; // Items align to the top of the card
    card.counterAxisAlignItems = "MIN"; // Corrected: Children will use layoutAlign = STRETCH to fill width
    card.itemSpacing = VERTICAL_SPACING_IN_CARD; // Vertical spacing between contentRowFrame and footer
    card.paddingTop = CARD_INTERNAL_PADDING;
    card.paddingBottom = CARD_INTERNAL_PADDING;
    card.paddingLeft = CARD_INTERNAL_PADDING;
    card.paddingRight = CARD_INTERNAL_PADDING;
    card.clipsContent = false; 

    // Create a new HORIZONTAL content row to hold screenshots and text stack side-by-side
    const contentRowFrame = figma.createFrame();
    contentRowFrame.name = "Content Row (Screenshots + Text)";
    contentRowFrame.layoutMode = "HORIZONTAL";
    // Calculate the width based on the parent card's content box width
    const cardContentWidth = COMPARISON_CARD_WIDTH - card.paddingLeft - card.paddingRight;
    contentRowFrame.resize(cardContentWidth, 0); // Width is fixed, height is initially 0, will be set by AUTO mode below
    contentRowFrame.primaryAxisSizingMode = "FIXED"; // Explicitly set width
    contentRowFrame.counterAxisSizingMode = "AUTO"; // Height based on its children
    contentRowFrame.itemSpacing = CARD_INTERNAL_PADDING; 
    contentRowFrame.layoutAlign = "STRETCH"; 
    contentRowFrame.clipsContent = false;

    // 1. SCREENSHOTS ROW (Horizontal Autolayout) - now added to contentRowFrame
    const screenshotsRowFrame = figma.createFrame();
    screenshotsRowFrame.name = "Screenshots Row";
    screenshotsRowFrame.layoutMode = "HORIZONTAL";
    screenshotsRowFrame.itemSpacing = SCREENSHOT_SPACING;
    screenshotsRowFrame.primaryAxisAlignItems = "MIN"; 
    screenshotsRowFrame.counterAxisAlignItems = "MIN"; 
    screenshotsRowFrame.primaryAxisSizingMode = "AUTO"; 
    screenshotsRowFrame.counterAxisSizingMode = "AUTO"; 
    screenshotsRowFrame.clipsContent = false; // Default to false

    // Create Yahoo Display Group (Label + Screenshot Section)
    const yahooDisplayGroup = figma.createFrame();
    yahooDisplayGroup.name = "Yahoo Display Group";
    yahooDisplayGroup.layoutMode = "VERTICAL";
    yahooDisplayGroup.itemSpacing = 8; 
    yahooDisplayGroup.primaryAxisSizingMode = "AUTO";
    yahooDisplayGroup.counterAxisSizingMode = "AUTO";
    yahooDisplayGroup.counterAxisAlignItems = "CENTER";
    yahooDisplayGroup.clipsContent = false; // Default to false

    const yahooLabel = figma.createText();
    yahooLabel.name = "Yahoo Label";
    try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); yahooLabel.fontName = { family: "Inter", style: "Bold" }; } catch(e){}
    yahooLabel.fontSize = 16;
    yahooLabel.characters = "Yahoo";
    yahooLabel.textAlignHorizontal = "CENTER";
    yahooLabel.layoutAlign = "STRETCH"; 
    yahooDisplayGroup.appendChild(yahooLabel);

    const yahooSection = await createScreenshotSection(
      query, "Yahoo", yahooScreenshotsByQuery,
      0, 0, SCREENSHOT_CONTAINER_WIDTH, SCREENSHOT_CONTAINER_HEIGHT, 0 
    );
    yahooDisplayGroup.appendChild(yahooSection);
    screenshotsRowFrame.appendChild(yahooDisplayGroup);

    // Create Competitor Display Group (Label + Screenshot Section)
    const competitorDisplayGroup = figma.createFrame();
    competitorDisplayGroup.name = `${competitorEngine} Display Group`;
    competitorDisplayGroup.layoutMode = "VERTICAL";
    competitorDisplayGroup.itemSpacing = 8;
    competitorDisplayGroup.primaryAxisSizingMode = "AUTO";
    competitorDisplayGroup.counterAxisSizingMode = "AUTO";
    competitorDisplayGroup.counterAxisAlignItems = "CENTER";
    competitorDisplayGroup.clipsContent = false; // Default to false

    const competitorLabel = figma.createText();
    competitorLabel.name = `${competitorEngine} Label`;
    try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); competitorLabel.fontName = { family: "Inter", style: "Bold" }; } catch(e){}
    competitorLabel.fontSize = 16;
    competitorLabel.characters = competitorEngine.charAt(0).toUpperCase() + competitorEngine.slice(1);
    competitorLabel.textAlignHorizontal = "CENTER";
    competitorLabel.layoutAlign = "STRETCH";
    competitorDisplayGroup.appendChild(competitorLabel);

    const competitorSection = await createScreenshotSection(
      query, competitorEngine, competitorScreenshotsByQuery,
      0, 0, SCREENSHOT_CONTAINER_WIDTH, SCREENSHOT_CONTAINER_HEIGHT, 0
    );
    competitorDisplayGroup.appendChild(competitorSection);
    screenshotsRowFrame.appendChild(competitorDisplayGroup);
    
    contentRowFrame.appendChild(screenshotsRowFrame);

    // Create a new vertical stack for all text-based info and additional data - now added to contentRowFrame
    const textAndDataStackFrame = figma.createFrame();
    textAndDataStackFrame.name = "Text and Data Stack";
    textAndDataStackFrame.layoutMode = "VERTICAL";
    textAndDataStackFrame.primaryAxisSizingMode = "AUTO"; // Height based on content
    textAndDataStackFrame.counterAxisSizingMode = "AUTO"; // Corrected from "FILL"
    textAndDataStackFrame.itemSpacing = 16; // Spacing between text elements in this stack
    textAndDataStackFrame.layoutAlign = "MIN"; // Vertical alignment: Align to top of contentRowFrame
    textAndDataStackFrame.layoutGrow = 1; // Grow to fill horizontal space in contentRowFrame // suspect this is not needed

    // 2. SEARCH INFO TEXT (Label + Value) - now added to textAndDataStackFrame
    const searchQueryLabelNode = figma.createText();
    searchQueryLabelNode.name = "Search Query Label";
    searchQueryLabelNode.fontName = { family: "Inter", style: "Bold" };
    searchQueryLabelNode.fontSize = TITLE_FONT_SIZE; // 24
    searchQueryLabelNode.characters = "Search Query:";
    searchQueryLabelNode.layoutAlign = "STRETCH"; 
    searchQueryLabelNode.textAlignHorizontal = "LEFT";
    textAndDataStackFrame.appendChild(searchQueryLabelNode);

    const searchQueryValueNode = figma.createText();
    searchQueryValueNode.name = "Search Query Value";
    searchQueryValueNode.fontName = { family: "Inter", style: "Regular" }; // Query value regular
    searchQueryValueNode.fontSize = TEXT_FONT_SIZE; // 16, or TITLE_FONT_SIZE if preferred
    searchQueryValueNode.characters = query;
    searchQueryValueNode.layoutAlign = "STRETCH";
    searchQueryValueNode.textAlignHorizontal = "LEFT";
    textAndDataStackFrame.appendChild(searchQueryValueNode);
    
    // 3. ADDITIONAL DATA TEXT (Container with Label + Values) - now added to textAndDataStackFrame
    if (additionalColumns.length > 0) {
      let matchingDataRow: string[] | undefined;
      for (const row of dataRows) {
        const rowQueryValue = queryColumn.index < row.length ? row[queryColumn.index].trim().toLowerCase() : "";
        if (rowQueryValue === query.toLowerCase()) { // query is already toLowerCase from Set
          matchingDataRow = row;
          break;
        }
      }
      
      if (matchingDataRow) {
        const additionalDataContainer = figma.createFrame();
        additionalDataContainer.name = "Additional Data Section";
        additionalDataContainer.layoutMode = "VERTICAL";
        additionalDataContainer.itemSpacing = 8; 
        additionalDataContainer.layoutAlign = "STRETCH"; 
        additionalDataContainer.primaryAxisSizingMode = "AUTO";
        additionalDataContainer.counterAxisSizingMode = "AUTO";
        additionalDataContainer.clipsContent = false; // Default to false
        // No internal padding for this container, relies on card's padding

        const additionalDataTitleNode = figma.createText();
        additionalDataTitleNode.name = "Additional Data Label";
        additionalDataTitleNode.fontName = { family: "Inter", style: "Bold" };
        additionalDataTitleNode.fontSize = TITLE_FONT_SIZE; // 24
        additionalDataTitleNode.characters = "Additional Data:";
        additionalDataTitleNode.layoutAlign = "STRETCH";
        additionalDataTitleNode.textAlignHorizontal = "LEFT";
        additionalDataContainer.appendChild(additionalDataTitleNode);
        
        let additionalDataTextContent = '';
        additionalColumns.forEach((col) => {
          if (col.index < matchingDataRow!.length) {
            const value = matchingDataRow![col.index].trim();
            additionalDataTextContent += `${col.name}: ${value}\n`;
          }
        });
        
        if (additionalDataTextContent) {
          // Remove trailing newline
          additionalDataTextContent = additionalDataTextContent.trim();
          const additionalDataValuesNode = figma.createText();
          additionalDataValuesNode.name = "Additional Data Values";
          additionalDataValuesNode.fontName = { family: "Inter", style: "Regular" };
          additionalDataValuesNode.fontSize = TEXT_FONT_SIZE; // 16
          additionalDataValuesNode.characters = additionalDataTextContent;
          additionalDataValuesNode.layoutAlign = "STRETCH";
          additionalDataValuesNode.textAlignHorizontal = "LEFT";
          additionalDataContainer.appendChild(additionalDataValuesNode);
        }
        textAndDataStackFrame.appendChild(additionalDataContainer);
      }
    }
    
    contentRowFrame.appendChild(textAndDataStackFrame);

    // Add the new content row (screenshots + text stack) to the main card
    card.appendChild(contentRowFrame);

    // 4. FOOTER (Meta Info) - a direct child of card, after the contentRowFrame
    const metaInfoNode = figma.createText();
    metaInfoNode.name = "Footer Meta Info";
    metaInfoNode.fontName = { family: "Inter", style: "Regular" };
    metaInfoNode.fontSize = 12;
    metaInfoNode.characters = `Engine: Yahoo vs ${competitorEngine.charAt(0).toUpperCase() + competitorEngine.slice(1)} | Mode: ${deviceMode.charAt(0).toUpperCase() + deviceMode.slice(1)}`;
    metaInfoNode.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    metaInfoNode.layoutAlign = "STRETCH";
    metaInfoNode.textAlignHorizontal = "LEFT"; 
    card.appendChild(metaInfoNode);

    mainFrame.appendChild(card); // Append card directly again
  }
  
  // Recalculate mainFrame height to include vertical spacing for rows
  const totalRows = Math.ceil(uniqueQueries.length / numCardsPerRow);

  const heightForAllCards = totalRows * COMPARISON_CARD_HEIGHT;
  const heightForAllVerticalGaps = Math.max(0, totalRows - 1) * MAIN_FRAME_GRID_SPACING;
  const mainFrameInternalContentHeight = heightForAllCards + heightForAllVerticalGaps;
  
  const totalMainFrameHeight = mainFrameInternalContentHeight + mainFrame.paddingTop + mainFrame.paddingBottom;

  // Get current width from previous calculation
  const currentMainFrameWidth = mainFrame.width;
  mainFrame.resize(currentMainFrameWidth, totalMainFrameHeight);
  mainFrame.counterAxisSizingMode = "FIXED"; // Height is now fixed

  figma.currentPage.appendChild(mainFrame);
  
  figma.notify('Screenshot comparisons imported successfully with new layout!');
  figma.closePlugin();
}

// Function to get search engine URL for a query - kept for backward compatibility
function getSearchUrl(query: string, engine: string): string {
  // Simple URL formatting
  switch (engine.toLowerCase()) {
    case 'bing':
      return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    case 'yahoo':
      return `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
    case 'google':
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }
}

// Utility function to create a text node with error handling
async function createTextNode(text: string, options: {
  fontSize?: number,
  fontFamily?: string,
  fontStyle?: string,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
  fill?: RGB | RGBA,
  parent?: BaseNode & ChildrenMixin
} = {}): Promise<TextNode> {
  try {
    // Create text node
    const textNode = figma.createText();
    
    // Set font if specified
    if (options.fontFamily || options.fontStyle) {
      const fontName = { 
        family: options.fontFamily || "Inter", 
        style: options.fontStyle || "Regular" 
      };
      
      try {
        await figma.loadFontAsync(fontName);
        textNode.fontName = fontName;
      } catch (err) {
        console.warn(`Failed to load font: ${fontName.family} ${fontName.style}. Using default font.`);
        // Continue with default font
      }
    }
    
    // Set text content
    textNode.characters = text;
    
    // Set fontSize if specified
    if (options.fontSize) {
      textNode.fontSize = options.fontSize;
    }
    
    // Set position if specified
    if (options.x !== undefined) textNode.x = options.x;
    if (options.y !== undefined) textNode.y = options.y;
    
    // Set size if specified
    if (options.width !== undefined || options.height !== undefined) {
      textNode.resize(
        options.width !== undefined ? options.width : textNode.width,
        options.height !== undefined ? options.height : textNode.height
      );
    }
    
    // Set fill if specified
    if (options.fill) {
      textNode.fills = [{ type: 'SOLID', color: options.fill }];
    }
    
    // Add to parent if specified
    if (options.parent && 'appendChild' in options.parent) {
      options.parent.appendChild(textNode);
    }
    
    return textNode;
  } catch (err: unknown) {
    console.error(`Error creating text node: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Utility function to create a frame with error handling
function createFrame(options: {
  name?: string,
  width?: number,
  height?: number,
  x?: number,
  y?: number,
  fill?: RGB | RGBA,
  cornerRadius?: number,
  parent?: BaseNode & ChildrenMixin
} = {}): FrameNode {
  try {
    // Create frame
    const frame = figma.createFrame();
    
    // Set name if specified
    if (options.name) {
      frame.name = options.name;
    }
    
    // Set size if specified
    if (options.width !== undefined || options.height !== undefined) {
      frame.resize(
        options.width !== undefined ? options.width : frame.width,
        options.height !== undefined ? options.height : frame.height
      );
    }
    
    // Set position if specified
    if (options.x !== undefined) frame.x = options.x;
    if (options.y !== undefined) frame.y = options.y;
    
    // Set fill if specified
    if (options.fill) {
      frame.fills = [{ type: 'SOLID', color: options.fill }];
    }
    
    // Set corner radius if specified
    if (options.cornerRadius !== undefined) {
      frame.cornerRadius = options.cornerRadius;
    }
    
    // Add to parent if specified
    if (options.parent && 'appendChild' in options.parent) {
      options.parent.appendChild(frame);
    }
    
    return frame;
  } catch (err: unknown) {
    console.error(`Error creating frame: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Utility function for user notifications with consistent formatting
function notifyUser(message: string, options: { error?: boolean, timeout?: number } = {}): void {
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

// Error tracking utility
class ErrorTracker {
  private errors: Array<{message: string, timestamp: number}> = [];
  private readonly maxErrors = 20;
  
  // Add an error to the tracker
  addError(message: string): void {
    this.errors.push({
      message,
      timestamp: Date.now()
    });
    
    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
  }
  
  // Get a summary of recent errors
  getErrorSummary(): string {
    if (this.errors.length === 0) {
      return "No errors recorded";
    }
    
    return this.errors.map(err => {
      const date = new Date(err.timestamp);
      return `[${date.toLocaleTimeString()}] ${err.message}`;
    }).join('\n');
  }
  
  // Check if we have errors
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
  
  // Get error count
  getErrorCount(): number {
    return this.errors.length;
  }
}

// Create a global error tracker
const errorTracker = new ErrorTracker();