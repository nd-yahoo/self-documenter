// This file holds the main code for the CSV to Screenshots Figma plugin
// The plugin imports a CSV file, takes a query column, runs screenshots, and embeds them in Figma

// Import utility classes
import { RateLimiter, MemoryManager, CsvUtils } from './src/utils';

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
const SAFE_IMAGE_DIMENSION = 3800; // Target a bit lower to be safe

// Create a global rate limiter instance for Figma API (max 5 requests per second)
const figmaApiLimiter = new RateLimiter(5);

// Create a global memory manager with defaults
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
        
        console.log(`Processing image: ${filename}, dimensions: ${img.width}x${img.height}, size: ${imageBytes.length / 1024} KB`);
        
        // Always check dimensions against our safe limit
        const needsResize = img.width > SAFE_IMAGE_DIMENSION || img.height > SAFE_IMAGE_DIMENSION || imageBytes.length > MAX_IMAGE_SIZE;
        
        if (!needsResize) {
          console.log(`Image ${filename} is within safe limits, no resize needed`);
          resolve(imageBytes);
          return;
        }
        
        console.log(`Resizing image ${filename}: Original dimensions ${img.width}x${img.height}`);
        
        // Calculate new dimensions while maintaining aspect ratio
        let newWidth, newHeight;
        const aspectRatio = img.width / img.height;
        
        if (img.width > img.height) {
          // Landscape orientation
          if (img.width > SAFE_IMAGE_DIMENSION) {
            newWidth = SAFE_IMAGE_DIMENSION;
            newHeight = Math.round(newWidth / aspectRatio);
          } else {
            newWidth = img.width;
            newHeight = img.height;
          }
          
          // Double-check height isn't too large
          if (newHeight > SAFE_IMAGE_DIMENSION) {
            newHeight = SAFE_IMAGE_DIMENSION;
            newWidth = Math.round(newHeight * aspectRatio);
          }
        } else {
          // Portrait orientation
          if (img.height > SAFE_IMAGE_DIMENSION) {
            newHeight = SAFE_IMAGE_DIMENSION;
            newWidth = Math.round(newHeight * aspectRatio);
          } else {
            newWidth = img.width;
            newHeight = img.height;
          }
          
          // Double-check width isn't too large
          if (newWidth > SAFE_IMAGE_DIMENSION) {
            newWidth = SAFE_IMAGE_DIMENSION;
            newHeight = Math.round(newWidth / aspectRatio);
          }
        }
        
        console.log(`Resizing image ${filename}: New dimensions ${newWidth}x${newHeight}`);
        
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
            const resizedBytes = new Uint8Array(buffer);
            console.log(`Resized image ${filename}: New size ${resizedBytes.length / 1024} KB`);
            resolve(resizedBytes);
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
    // Log information about the image
    console.log(`Processing image ${imageData.filename} for Figma (${imageData.imageBytes.length / 1024} KB)`);
    
    // Always resize images to ensure they meet Figma's requirements
    const resizedBytes = await resizeImageBytes(imageData.imageBytes, imageData.filename);
    
    // Verify final dimensions to make sure we're under limits
    const verifyDimensions = await new Promise<{ width: number, height: number }>((resolve, reject) => {
      const blob = new Blob([resizedBytes], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to verify dimensions"));
      };
      
      img.src = url;
    }).catch(() => ({ width: 0, height: 0 }));
    
    // Log final dimensions
    console.log(`Final image dimensions for ${imageData.filename}: ${verifyDimensions.width}x${verifyDimensions.height}`);
    
    // Check if dimensions are still too large
    if (verifyDimensions.width > MAX_IMAGE_DIMENSION || verifyDimensions.height > MAX_IMAGE_DIMENSION) {
      console.error(`WARNING: Image ${imageData.filename} still exceeds Figma's maximum dimensions after resizing`);
    }
    
    // Return processed image data
    return {
      ...imageData,
      imageBytes: resizedBytes,
      filename: imageData.imageBytes.length !== resizedBytes.length ? 
               imageData.filename + " (resized)" : imageData.filename
    };
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
      
      // Create a simple representation of the data with CsvUtils
      const { headers, rows } = CsvUtils.parseSimple(csvData);
      const queryColIndex = queryColumn.index;
      
      // Create debug text
      textNode.characters = 
        `CSV COLUMN DEBUG\n` +
        `Query column index: ${queryColIndex}\n` +
        `Query column name: ${queryColumn.name}\n` +
        `Headers: ${JSON.stringify(headers)}\n` +
        `Header at queryColumn.index: "${queryColIndex < headers.length ? headers[queryColIndex] : 'OUT OF BOUNDS'}"\n\n` +
        `First 3 data rows (${rows.length} total rows):\n`;
      
      // Add the first few data rows for reference
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const row = rows[i];
        const queryVal = queryColIndex < row.length ? row[queryColIndex] : 'OUT OF BOUNDS';
        textNode.characters += `Row ${i+1}: Query value = "${queryVal}"\n`;
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
  
  // Validate the CSV data
  const validation = CsvUtils.validateCsvData(csvData);
  if (!validation.isValid) {
    sendDebugInfo(`ERROR: ${validation.error}`);
    figma.notify(validation.error || 'Invalid CSV data');
    figma.closePlugin();
    return;
  }
  
  sendDebugInfo(`CSV data received: ${csvData.length} characters`);
  sendDebugInfo(`First 50 chars: ${csvData.substring(0, 50)}`);
  
  // Parse CSV data
  const parsedData = CsvUtils.parseCSV(csvData);
  
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
  
  // Filter rows using CsvUtils
  const filteredData = CsvUtils.filterRows(parsedData, queryColumn.index);
  const dataRows = filteredData.slice(1); // Skip header row
  
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
  // Parse CSV with CsvUtils
  figma.ui.postMessage({ type: 'update-progress', message: 'Parsing CSV data...' });
  
  // Use the simple parsing function which returns headers and rows directly
  const { headers, rows } = CsvUtils.parseSimple(csvData);
  
  figma.ui.postMessage({ type: 'update-progress', message: `Found ${rows.length} data rows` });
  
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
    // Continue execution - we'll try to use system fonts as fallback
  }
  
  // New card size for side-by-side comparison
  const COMPARISON_CARD_WIDTH = 880;
  const COMPARISON_CARD_HEIGHT = 800; // Increased from 500 to accommodate taller screenshots
  const SCREENSHOT_WIDTH = 200;
  const SCREENSHOT_HEIGHT = 700; // Increased from 400 to show more of the taller screenshots
  const SCREENSHOT_SPACING = 40;
  
  // Calculate grid dimensions
  const totalCards = allQueries.size;
  const CARDS_PER_ROW = 4; // Display 4 comparison cards per row
  const totalRows = Math.ceil(totalCards / CARDS_PER_ROW);
  const gridWidth = CARDS_PER_ROW * COMPARISON_CARD_WIDTH + (CARDS_PER_ROW - 1) * GRID_SPACING;
  const gridHeight = totalRows * COMPARISON_CARD_HEIGHT + (totalRows - 1) * GRID_SPACING;
  
  // Create frame to hold all cards
  const mainFrame = figma.createFrame();
  mainFrame.name = "Search Engine Comparisons";
  mainFrame.resize(gridWidth, gridHeight);
  mainFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  mainFrame.itemSpacing = GRID_SPACING;
  mainFrame.layoutMode = "NONE"; // Use absolute positioning for precise control
  
  // Create an array of unique queries to iterate through
  const uniqueQueries = Array.from(allQueries);
  
  // For each unique query, create a comparison card
  for (let i = 0; i < uniqueQueries.length; i++) {
    figma.ui.postMessage({ 
      type: 'update-progress', 
      message: `Processing comparison ${i + 1} of ${uniqueQueries.length}...` 
    });
    
    const query = uniqueQueries[i];
    
    // Calculate grid position
    const colIndex = i % CARDS_PER_ROW;
    const rowIndex = Math.floor(i / CARDS_PER_ROW);
    const xPos = colIndex * (COMPARISON_CARD_WIDTH + GRID_SPACING);
    const yPos = rowIndex * (COMPARISON_CARD_HEIGHT + GRID_SPACING);
    
    // Create card container
    const card = figma.createFrame();
    card.name = `Comparison: ${query}`;
    card.resize(COMPARISON_CARD_WIDTH, COMPARISON_CARD_HEIGHT);
    card.x = xPos;
    card.y = yPos;
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
    
    // Create title for the card with the query
    const queryTitle = figma.createText();
    queryTitle.name = "Search Query";
    queryTitle.fontName = { family: "Inter", style: "Bold" };
    queryTitle.fontSize = TITLE_FONT_SIZE;
    queryTitle.characters = query;
    queryTitle.x = CARD_PADDING;
    queryTitle.y = CARD_PADDING;
    queryTitle.resize(COMPARISON_CARD_WIDTH - (CARD_PADDING * 2), 30);
    queryTitle.textAlignHorizontal = 'CENTER';
    card.appendChild(queryTitle);
    
    // -- YAHOO SCREENSHOT SECTION --
    const yahooSection = figma.createFrame();
    yahooSection.name = "Yahoo Screenshot";
    yahooSection.resize(SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT);
    yahooSection.x = CARD_PADDING;
    yahooSection.y = CARD_PADDING + 40;
    yahooSection.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
    
    // Add Yahoo title
    const yahooTitle = figma.createText();
    yahooTitle.name = "Yahoo";
    yahooTitle.fontName = { family: "Inter", style: "Bold" };
    yahooTitle.fontSize = 16;
    yahooTitle.characters = "Yahoo";
    yahooTitle.x = 0;
    yahooTitle.y = -30;
    yahooTitle.resize(SCREENSHOT_WIDTH, 20);
    yahooTitle.textAlignHorizontal = 'CENTER';
    yahooSection.appendChild(yahooTitle);
    
    // Check if we have a matching Yahoo screenshot
    const yahooScreenshot = yahooScreenshotsByQuery.get(query);
    
    if (yahooScreenshot) {
      try {
        // Create an image fill from the screenshot data - no need for size checking here as we've already processed it
        const image = figma.createImage(yahooScreenshot.imageBytes);
        
        // Create proper container and apply image
        yahooSection.fills = [];
        yahooSection.clipsContent = true;
        
        // Create inner container for the image
        const imageContainer = figma.createFrame();
        imageContainer.name = "Yahoo Image Container";
        imageContainer.resize(SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT); // Match parent size
        imageContainer.fills = [];
        imageContainer.x = 0;
        imageContainer.y = 0;
        
        // Apply the image as a fill with proper scaling
        imageContainer.fills = [{
          type: 'IMAGE',
          scaleMode: 'FILL',
          imageHash: image.hash
        }];
        
        yahooSection.appendChild(imageContainer);
        
        // Add small filename text at the bottom
        const filenameText = figma.createText();
        filenameText.characters = yahooScreenshot.filename;
        filenameText.fontSize = 8;
        filenameText.x = 5;
        filenameText.y = SCREENSHOT_HEIGHT - 15;
        filenameText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
        yahooSection.appendChild(filenameText);
        
      } catch (err: any) {
        console.error(`Error using Yahoo screenshot for "${query}":`, err);
        
        // Add error message to placeholder
        yahooSection.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        
        const placeholderText = figma.createText();
        placeholderText.characters = `Error loading Yahoo screenshot:\n${err.message || 'Unknown error'}`;
        placeholderText.fontSize = 12;
        placeholderText.x = 10;
        placeholderText.y = SCREENSHOT_HEIGHT / 2 - 20;
        placeholderText.resize(SCREENSHOT_WIDTH - 20, 60);
        placeholderText.textAlignHorizontal = 'CENTER';
        placeholderText.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
        yahooSection.appendChild(placeholderText);
      }
    } else {
      // No matching Yahoo screenshot
      yahooSection.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
      
      const noImageText = figma.createText();
      noImageText.characters = `No Yahoo screenshot available for query:\n"${query}"`;
      noImageText.fontSize = 14;
      noImageText.x = 10;
      noImageText.y = SCREENSHOT_HEIGHT / 2 - 30;
      noImageText.resize(SCREENSHOT_WIDTH - 20, 60);
      noImageText.textAlignHorizontal = 'CENTER';
      noImageText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      yahooSection.appendChild(noImageText);
    }
    
    // -- COMPETITOR SCREENSHOT SECTION --
    const competitorSection = figma.createFrame();
    competitorSection.name = `${competitorEngine} Screenshot`;
    competitorSection.resize(SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT);
    competitorSection.x = CARD_PADDING + SCREENSHOT_WIDTH + SCREENSHOT_SPACING;
    competitorSection.y = CARD_PADDING + 50;
    competitorSection.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
    
    // Add competitor title
    const competitorTitle = figma.createText();
    competitorTitle.name = competitorEngine;
    competitorTitle.fontName = { family: "Inter", style: "Bold" };
    competitorTitle.fontSize = 16;
    competitorTitle.characters = competitorEngine.charAt(0).toUpperCase() + competitorEngine.slice(1);
    competitorTitle.x = 0;
    competitorTitle.y = -30;
    competitorTitle.resize(SCREENSHOT_WIDTH, 20);
    competitorTitle.textAlignHorizontal = 'CENTER';
    competitorSection.appendChild(competitorTitle);
    
    // Check if we have a matching competitor screenshot
    const competitorScreenshot = competitorScreenshotsByQuery.get(query);
    
    if (competitorScreenshot) {
      try {
        // Create an image fill from the screenshot data - no need for size checking here as we've already processed it
        const image = figma.createImage(competitorScreenshot.imageBytes);
        
        // Create proper container and apply image
        competitorSection.fills = [];
        competitorSection.clipsContent = true;
        
        // Create inner container for the image
        const imageContainer = figma.createFrame();
        imageContainer.name = `${competitorEngine} Image Container`;
        imageContainer.resize(SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT); // Match parent size
        imageContainer.fills = [];
        imageContainer.x = 0;
        imageContainer.y = 0;
        
        // Apply the image as a fill with proper scaling
        imageContainer.fills = [{
          type: 'IMAGE',
          scaleMode: 'FILL',
          imageHash: image.hash
        }];
        
        competitorSection.appendChild(imageContainer);
        
        // Add small filename text at the bottom
        const filenameText = figma.createText();
        filenameText.characters = competitorScreenshot.filename;
        filenameText.fontSize = 8;
        filenameText.x = 5;
        filenameText.y = SCREENSHOT_HEIGHT - 15;
        filenameText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
        competitorSection.appendChild(filenameText);
        
      } catch (err: any) {
        console.error(`Error using ${competitorEngine} screenshot for "${query}":`, err);
        
        // Add error message to placeholder
        competitorSection.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        
        const placeholderText = figma.createText();
        placeholderText.characters = `Error loading ${competitorEngine} screenshot:\n${err.message || 'Unknown error'}`;
        placeholderText.fontSize = 12;
        placeholderText.x = 10;
        placeholderText.y = SCREENSHOT_HEIGHT / 2 - 20;
        placeholderText.resize(SCREENSHOT_WIDTH - 20, 60);
        placeholderText.textAlignHorizontal = 'CENTER';
        placeholderText.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
        competitorSection.appendChild(placeholderText);
      }
    } else {
      // No matching competitor screenshot
      competitorSection.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
      
      const noImageText = figma.createText();
      noImageText.characters = `No ${competitorEngine} screenshot available for query:\n"${query}"`;
      noImageText.fontSize = 14;
      noImageText.x = 10;
      noImageText.y = SCREENSHOT_HEIGHT / 2 - 30;
      noImageText.resize(SCREENSHOT_WIDTH - 20, 60);
      noImageText.textAlignHorizontal = 'CENTER';
      noImageText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      competitorSection.appendChild(noImageText);
    }
    
    // Add metadata 
    const metaInfo = figma.createText();
    metaInfo.characters = `Engine: Yahoo vs ${competitorEngine.charAt(0).toUpperCase() + competitorEngine.slice(1)} | Mode: ${deviceMode.charAt(0).toUpperCase() + deviceMode.slice(1)}`;
    metaInfo.fontSize = 12;
    metaInfo.x = CARD_PADDING;
    metaInfo.y = COMPARISON_CARD_HEIGHT - CARD_PADDING - 16;
    metaInfo.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    
    // Add the sections to the card
    card.appendChild(yahooSection);
    card.appendChild(competitorSection);
    card.appendChild(queryTitle);
    card.appendChild(metaInfo);
    
    // Add additional data columns if available
    if (additionalColumns.length > 0) {
      // Find the matching data row by query
      let matchingDataRow: string[] | undefined;
      for (const row of rows) {
        const rowQueryValue = queryColumn.index < row.length ? row[queryColumn.index].trim() : "";
        if (rowQueryValue.toLowerCase() === query.toLowerCase()) {
          matchingDataRow = row;
          break;
        }
      }
      
      if (matchingDataRow) {
        // Create additional data section
        const additionalDataTitle = figma.createText();
        additionalDataTitle.name = "Additional Data";
        additionalDataTitle.fontName = { family: "Inter", style: "Bold" };
        additionalDataTitle.fontSize = 14;
        additionalDataTitle.characters = "Additional Data:";
        additionalDataTitle.x = CARD_PADDING;
        additionalDataTitle.y = CARD_PADDING + 50 + SCREENSHOT_HEIGHT + 10; // Below the screenshots
        card.appendChild(additionalDataTitle);
        
        // Add each selected additional column
        let additionalDataText = '';
        additionalColumns.forEach((col, idx) => {
          if (col.index < matchingDataRow!.length) {
            const value = matchingDataRow![col.index].trim();
            additionalDataText += `${col.name}: ${value}\n`;
          }
        });
        
        if (additionalDataText) {
          const additionalData = figma.createText();
          additionalData.name = "Additional Data Values";
          additionalData.fontSize = 12;
          additionalData.characters = additionalDataText;
          additionalData.x = CARD_PADDING;
          additionalData.y = CARD_PADDING + 50 + SCREENSHOT_HEIGHT + 30; // Below the additionalDataTitle
          additionalData.resize(COMPARISON_CARD_WIDTH - (CARD_PADDING * 2), 60);
          card.appendChild(additionalData);
        }
      }
    }
    
    // Add card to main frame
    mainFrame.appendChild(card);
  }
  
  // Add the main frame to the Figma document
  figma.currentPage.appendChild(mainFrame);
  
  // Select the main frame and zoom to it
  figma.currentPage.selection = [mainFrame];
  figma.viewport.scrollAndZoomIntoView([mainFrame]);
  
  // Notify completion
  figma.notify('Screenshot comparisons imported successfully!');
  
  // Close the plugin
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
