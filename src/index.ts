import { PluginMessage, ScreenshotData, QueryColumn, AdditionalColumn } from './types';
import { RateLimiter } from './utils/RateLimiter';
import { MemoryManager } from './utils/MemoryManager';
import { ErrorTracker } from './utils/ErrorTracker';
import { processCSVWithScreenshots } from './services/csvProcessor';
import { notifyUser, sendDebugInfo } from './utils/notifications';
import { createTextNode } from './ui/figmaElements';

// Create global instances of utility classes
const figmaApiLimiter = new RateLimiter(5);
const memoryManager = new MemoryManager(50, 60000);
const errorTracker = new ErrorTracker(20);

// Main plugin code
try {
  // Create a text node directly on startup to confirm plugin is loading
  createTextNode("CSV Plugin Debug: Plugin loaded successfully at " + new Date().toLocaleTimeString(), {
    fontFamily: "Inter",
    fontStyle: "Regular",
    fontSize: 14,
    width: 400,
    height: 50
  }).then(debugNode => {
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

// Message handler for communication with the UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'process-csv') {
    try {
      // Extract data from message
      const csvData = msg.csvData || '';
      const queryColumn = msg.queryColumn || { index: 0, name: '' };
      const additionalColumns = msg.additionalColumns || [];
      const deviceMode = msg.deviceMode || 'mobile';
      const yahooScreenshots = msg.yahooScreenshots || [];
      const competitorScreenshots = msg.competitorScreenshots || [];
      const competitorEngine = msg.competitorEngine || 'unknown';
      
      // Log screenshot info
      if (yahooScreenshots.length > 0 || competitorScreenshots.length > 0) {
        console.log(`Received ${yahooScreenshots.length} Yahoo screenshots and ${competitorScreenshots.length} competitor screenshots`);
      }
      
      // Create debug info on the canvas
      await createDebugInfo(csvData, queryColumn, yahooScreenshots, competitorScreenshots, competitorEngine);
      
      // Process the CSV with screenshots
      await processCSVWithScreenshots(
        csvData,
        queryColumn,
        additionalColumns,
        deviceMode,
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

/**
 * Create debug information on the canvas
 */
async function createDebugInfo(
  csvData: string,
  queryColumn: QueryColumn,
  yahooScreenshots: ScreenshotData[],
  competitorScreenshots: ScreenshotData[],
  competitorEngine: string
): Promise<void> {
  // Create a text node with debug information about the query column
  const textNode = await createTextNode('', {
    fontFamily: "Inter",
    fontStyle: "Regular",
    fontSize: 10,
    width: 400,
    height: 300
  });
  
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
  
  figma.currentPage.appendChild(textNode);
  
  // Select the text node and focus on it
  figma.currentPage.selection = [textNode];
  figma.viewport.scrollAndZoomIntoView([textNode]);
  
  figma.notify('Query column debug info created on canvas');
} 