var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { UI_CONSTANTS } from '../types';
import { processFigmaImage } from '../utils/imageUtils';
import { createTextNode, createFrame } from '../ui/figmaElements';
import { notifyUser, sendProgressUpdate } from '../utils/notifications';
/**
 * Process CSV data with screenshots
 *
 * @param csvData Raw CSV string data
 * @param queryColumn Selected query column information
 * @param additionalColumns Additional columns to include
 * @param yahooScreenshots Array of Yahoo screenshots
 * @param competitorScreenshots Array of competitor screenshots
 * @param competitorEngine Name of the competitor search engine
 */
export function processCSVWithScreenshots(csvData, queryColumn, additionalColumns, deviceMode, yahooScreenshots, competitorScreenshots, competitorEngine) {
    return __awaiter(this, void 0, void 0, function* () {
        // Parse CSV with a very simple approach
        sendProgressUpdate('Parsing CSV data...');
        // Simple CSV parsing without validation errors
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        const headers = lines[0].split(',');
        // Create data rows directly - skip all the validation that was causing problems
        const dataRows = lines.slice(1).map(line => line.split(','));
        sendProgressUpdate(`Found ${dataRows.length} data rows`);
        // Process and resize images before indexing
        sendProgressUpdate('Processing Yahoo screenshots...');
        const processedYahooScreenshots = [];
        for (const screenshot of yahooScreenshots) {
            try {
                const processed = yield processFigmaImage(screenshot);
                processedYahooScreenshots.push(processed);
            }
            catch (err) {
                console.error(`Failed to process Yahoo screenshot for query "${screenshot.query}": ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        sendProgressUpdate('Processing competitor screenshots...');
        const processedCompetitorScreenshots = [];
        for (const screenshot of competitorScreenshots) {
            try {
                const processed = yield processFigmaImage(screenshot);
                processedCompetitorScreenshots.push(processed);
            }
            catch (err) {
                console.error(`Failed to process ${competitorEngine} screenshot for query "${screenshot.query}": ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        // Index screenshots by query for quick lookup
        const yahooScreenshotsByQuery = new Map();
        for (const screenshot of processedYahooScreenshots) {
            yahooScreenshotsByQuery.set(screenshot.query.toLowerCase().trim(), screenshot);
        }
        const competitorScreenshotsByQuery = new Map();
        for (const screenshot of processedCompetitorScreenshots) {
            competitorScreenshotsByQuery.set(screenshot.query.toLowerCase().trim(), screenshot);
        }
        // Build a set of all unique queries found in either screenshot set
        const allQueries = new Set();
        processedYahooScreenshots.forEach(screenshot => allQueries.add(screenshot.query.toLowerCase().trim()));
        processedCompetitorScreenshots.forEach(screenshot => allQueries.add(screenshot.query.toLowerCase().trim()));
        // Load fonts
        sendProgressUpdate('Loading fonts...');
        try {
            yield Promise.all([
                figma.loadFontAsync({ family: "Inter", style: "Regular" }),
                figma.loadFontAsync({ family: "Inter", style: "Bold" })
            ]);
            sendProgressUpdate('Fonts loaded successfully');
        }
        catch (err) {
            console.error(`Error loading fonts: ${err instanceof Error ? err.message : String(err)}`);
            sendProgressUpdate('Warning: Some fonts failed to load, text may not display correctly');
            // Continue execution - we'll try to use system fonts as fallback
        }
        // New card size for side-by-side comparison
        const COMPARISON_CARD_WIDTH = 880;
        const COMPARISON_CARD_HEIGHT = 1040;
        const SCREENSHOT_WIDTH = 200;
        const SCREENSHOT_HEIGHT = 872;
        const SCREENSHOT_SPACING = 40;
        // Calculate grid dimensions
        const totalCards = allQueries.size;
        const CARDS_PER_ROW = 4; // Display 4 comparison cards per row
        const totalRows = Math.ceil(totalCards / CARDS_PER_ROW);
        const gridWidth = CARDS_PER_ROW * COMPARISON_CARD_WIDTH + (CARDS_PER_ROW - 1) * UI_CONSTANTS.GRID_SPACING;
        const gridHeight = totalRows * COMPARISON_CARD_HEIGHT + (totalRows - 1) * UI_CONSTANTS.GRID_SPACING;
        // Create frame to hold all cards
        const mainFrame = createFrame({
            name: "Search Engine Comparisons",
            width: gridWidth,
            height: gridHeight,
            fill: { r: 0.95, g: 0.95, b: 0.95 }
        });
        // Create an array of unique queries to iterate through
        const uniqueQueries = Array.from(allQueries);
        // For each unique query, create a comparison card
        for (let i = 0; i < uniqueQueries.length; i++) {
            sendProgressUpdate(`Processing comparison ${i + 1} of ${uniqueQueries.length}...`, Math.round((i / uniqueQueries.length) * 100));
            const query = uniqueQueries[i];
            // Calculate grid position
            const colIndex = i % CARDS_PER_ROW;
            const rowIndex = Math.floor(i / CARDS_PER_ROW);
            const xPos = colIndex * (COMPARISON_CARD_WIDTH + UI_CONSTANTS.GRID_SPACING);
            const yPos = rowIndex * (COMPARISON_CARD_HEIGHT + UI_CONSTANTS.GRID_SPACING);
            // Create card container
            const card = createFrame({
                name: `Comparison: ${query}`,
                width: COMPARISON_CARD_WIDTH,
                height: COMPARISON_CARD_HEIGHT,
                x: xPos,
                y: yPos,
                fill: { r: 1, g: 1, b: 1 },
                cornerRadius: 8,
                parent: mainFrame
            });
            // Add shadow effect to card
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
            yield createTextNode(query, {
                name: "Search Query",
                fontFamily: "Inter",
                fontStyle: "Bold",
                fontSize: UI_CONSTANTS.TITLE_FONT_SIZE,
                x: UI_CONSTANTS.CARD_PADDING,
                y: UI_CONSTANTS.CARD_PADDING,
                width: COMPARISON_CARD_WIDTH - (UI_CONSTANTS.CARD_PADDING * 2),
                height: 30,
                parent: card
            });
            // Create screenshot sections and add them to the card
            yield createComparisonScreenshots(card, query, yahooScreenshotsByQuery, competitorScreenshotsByQuery, competitorEngine, SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT, UI_CONSTANTS.CARD_PADDING, SCREENSHOT_SPACING);
            // Add metadata 
            yield createTextNode(`Engine: Yahoo vs ${competitorEngine.charAt(0).toUpperCase() + competitorEngine.slice(1)} | Mode: ${deviceMode.charAt(0).toUpperCase() + deviceMode.slice(1)}`, {
                fontSize: 12,
                x: UI_CONSTANTS.CARD_PADDING,
                y: COMPARISON_CARD_HEIGHT - UI_CONSTANTS.CARD_PADDING - 16,
                fill: { r: 0.5, g: 0.5, b: 0.5 },
                parent: card
            });
            // Add additional data columns if available
            if (additionalColumns.length > 0) {
                // Find the matching data row by query
                let matchingDataRow;
                for (const row of dataRows) {
                    const rowQueryValue = queryColumn.index < row.length ? row[queryColumn.index].trim() : "";
                    if (rowQueryValue.toLowerCase() === query.toLowerCase()) {
                        matchingDataRow = row;
                        break;
                    }
                }
                if (matchingDataRow) {
                    yield addAdditionalData(card, matchingDataRow, additionalColumns, SCREENSHOT_HEIGHT, UI_CONSTANTS.CARD_PADDING);
                }
            }
        }
        // Add the main frame to the Figma document
        figma.currentPage.appendChild(mainFrame);
        // Select the main frame and zoom to it
        figma.currentPage.selection = [mainFrame];
        figma.viewport.scrollAndZoomIntoView([mainFrame]);
        // Notify completion
        notifyUser('Screenshot comparisons imported successfully!');
    });
}
/**
 * Create comparison screenshots section in a card
 */
function createComparisonScreenshots(card, query, yahooScreenshotsByQuery, competitorScreenshotsByQuery, competitorEngine, width, height, padding, spacing) {
    return __awaiter(this, void 0, void 0, function* () {
        // -- YAHOO SCREENSHOT SECTION --
        const yahooSection = createFrame({
            name: "Yahoo Screenshot",
            width: width,
            height: height,
            x: padding,
            y: padding + 40,
            fill: { r: 0.96, g: 0.96, b: 0.96 },
            parent: card
        });
        // Add Yahoo title
        yield createTextNode("Yahoo", {
            name: "Yahoo",
            fontFamily: "Inter",
            fontStyle: "Bold",
            fontSize: 16,
            x: 0,
            y: -30,
            width: width,
            height: 20,
            parent: yahooSection
        });
        // Check if we have a matching Yahoo screenshot
        const yahooScreenshot = yahooScreenshotsByQuery.get(query);
        if (yahooScreenshot) {
            try {
                // Create an image fill from the screenshot data
                const image = figma.createImage(yahooScreenshot.imageBytes);
                // Create proper container and apply image
                yahooSection.fills = [];
                yahooSection.clipsContent = true; // Important: ensure clipping is enabled
                // Create inner container for the image
                const imageContainer = createFrame({
                    name: "Yahoo Image Container",
                    width: width,
                    height: height,
                    x: 0,
                    y: 0,
                    parent: yahooSection
                });
                // Apply the image as a fill with proper scaling
                imageContainer.fills = [{
                        type: 'IMAGE',
                        scaleMode: 'FIT', // Use FIT to maintain aspect ratio
                        imageHash: image.hash
                    }];
                // Configure the image to be anchored at the top
                imageContainer.constraints = {
                    horizontal: 'STRETCH',
                    vertical: 'MIN' // This anchors to the top
                };
                // Add small filename text at the bottom
                yield createTextNode(yahooScreenshot.filename, {
                    fontSize: 8,
                    x: 5,
                    y: height - 15,
                    fill: { r: 0.5, g: 0.5, b: 0.5 },
                    parent: yahooSection
                });
            }
            catch (err) {
                console.error(`Error using Yahoo screenshot for "${query}":`, err);
                // Add error message to placeholder
                yahooSection.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
                yield createTextNode(`Error loading Yahoo screenshot:\n${err.message || 'Unknown error'}`, {
                    fontSize: 12,
                    x: 10,
                    y: height / 2 - 20,
                    width: width - 20,
                    height: 60,
                    fill: { r: 0.8, g: 0.2, b: 0.2 },
                    parent: yahooSection
                });
            }
        }
        else {
            // No matching Yahoo screenshot
            yahooSection.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
            yield createTextNode(`No Yahoo screenshot available for query:\n"${query}"`, {
                fontSize: 14,
                x: 10,
                y: height / 2 - 30,
                width: width - 20,
                height: 60,
                fill: { r: 0.4, g: 0.4, b: 0.4 },
                parent: yahooSection
            });
        }
        // -- COMPETITOR SCREENSHOT SECTION --
        const competitorSection = createFrame({
            name: `${competitorEngine} Screenshot`,
            width: width,
            height: height,
            x: padding + width + spacing,
            y: padding + 50,
            fill: { r: 0.96, g: 0.96, b: 0.96 },
            parent: card
        });
        // Add competitor title
        yield createTextNode(competitorEngine.charAt(0).toUpperCase() + competitorEngine.slice(1), {
            name: competitorEngine,
            fontFamily: "Inter",
            fontStyle: "Bold",
            fontSize: 16,
            x: 0,
            y: -30,
            width: width,
            height: 20,
            parent: competitorSection
        });
        // Check if we have a matching competitor screenshot
        const competitorScreenshot = competitorScreenshotsByQuery.get(query);
        if (competitorScreenshot) {
            try {
                // Create an image fill from the screenshot data
                const image = figma.createImage(competitorScreenshot.imageBytes);
                // Create proper container and apply image
                competitorSection.fills = [];
                competitorSection.clipsContent = true; // Important: ensure clipping is enabled
                // Create inner container for the image
                const imageContainer = createFrame({
                    name: `${competitorEngine} Image Container`,
                    width: width,
                    height: height,
                    x: 0,
                    y: 0,
                    parent: competitorSection
                });
                // Apply the image as a fill with proper scaling
                imageContainer.fills = [{
                        type: 'IMAGE',
                        scaleMode: 'FIT', // Use FIT to maintain aspect ratio
                        imageHash: image.hash
                    }];
                // Configure the image to be anchored at the top
                imageContainer.constraints = {
                    horizontal: 'STRETCH',
                    vertical: 'MIN' // This anchors to the top
                };
                // Add small filename text at the bottom
                yield createTextNode(competitorScreenshot.filename, {
                    fontSize: 8,
                    x: 5,
                    y: height - 15,
                    fill: { r: 0.5, g: 0.5, b: 0.5 },
                    parent: competitorSection
                });
            }
            catch (err) {
                console.error(`Error using ${competitorEngine} screenshot for "${query}":`, err);
                // Add error message to placeholder
                competitorSection.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
                yield createTextNode(`Error loading ${competitorEngine} screenshot:\n${err.message || 'Unknown error'}`, {
                    fontSize: 12,
                    x: 10,
                    y: height / 2 - 20,
                    width: width - 20,
                    height: 60,
                    fill: { r: 0.8, g: 0.2, b: 0.2 },
                    parent: competitorSection
                });
            }
        }
        else {
            // No matching competitor screenshot
            competitorSection.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
            yield createTextNode(`No ${competitorEngine} screenshot available for query:\n"${query}"`, {
                fontSize: 14,
                x: 10,
                y: height / 2 - 30,
                width: width - 20,
                height: 60,
                fill: { r: 0.4, g: 0.4, b: 0.4 },
                parent: competitorSection
            });
        }
    });
}
/**
 * Add additional data section to a card
 */
function addAdditionalData(card, dataRow, additionalColumns, screenshotHeight, padding) {
    return __awaiter(this, void 0, void 0, function* () {
        // Create additional data section
        const additionalDataTitle = yield createTextNode("Additional Data:", {
            name: "Additional Data",
            fontFamily: "Inter",
            fontStyle: "Bold",
            fontSize: 14,
            x: padding,
            y: padding + 50 + screenshotHeight + 10, // Below the screenshots
            parent: card
        });
        // Add each selected additional column
        let additionalDataText = '';
        additionalColumns.forEach((col, idx) => {
            if (col.index < dataRow.length) {
                const value = dataRow[col.index].trim();
                additionalDataText += `${col.name}: ${value}\n`;
            }
        });
        if (additionalDataText) {
            yield createTextNode(additionalDataText, {
                name: "Additional Data Values",
                fontSize: 12,
                x: padding,
                y: padding + 50 + screenshotHeight + 30, // Below the additionalDataTitle
                width: 800, // Use most of card width
                height: 60,
                parent: card
            });
        }
    });
}
