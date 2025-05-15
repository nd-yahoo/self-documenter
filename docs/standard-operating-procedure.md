# Standard Operating Procedure: CSV to Screenshots Figma Plugin

## Overview

This document outlines how to use the CSV to Screenshots Figma plugin, which allows you to:

1. Import a CSV file containing search queries
2. Capture screenshots of search results for those queries
3. Embed the screenshots with metadata into your Figma designs

## Prerequisites

- Figma Desktop app installed
- Node.js installed (v14 or later)
- Basic terminal/command line knowledge

## 1. Installation

### 1.1 Install Node.js Dependencies

```bash
npm install playwright csv-parser yargs
# Install Playwright browsers
npx playwright install chromium
```

### 1.2 Install the Figma Plugin

1. In Figma Desktop, go to **Plugins > Development > Import plugin from manifest**
2. Select the manifest.json file from the plugin directory

## 2. Preparing Your CSV File

Create a CSV file with these requirements:

- Must contain a header row
- Include a column for search queries
- Optional additional columns for metadata (labels, descriptions, etc.)

Example CSV format:
```
query,category,notes
iphone 14 pro,Electronics,Compare with competitors
healthy breakfast ideas,Food,Target morning routine
```

## 3. Capturing Screenshots

You have two options:

### Option A: Use the Node.js Screenshot Tool (Recommended)

This method allows you to generate screenshots in advance, which is faster and more reliable.

1. Open your terminal and navigate to the plugin directory
2. Run the screenshot tool:

```bash
node search_screenshot.js your_file.csv --column=query --output=screenshots --engine=google --mode=mobile
```

Command parameters:
- `your_file.csv`: Path to your CSV file
- `--column=query`: Name or index of the column containing search queries
- `--output=screenshots`: Directory where screenshots will be saved
- `--engine=google`: Search engine (options: google, bing, duckduckgo, yahoo)
- `--mode=mobile`: Device mode (options: mobile, desktop)
- `--delay=1`: Optional delay in seconds before capture (default: 1)

The tool will create a folder with screenshots named following this pattern:
`001_google_mobile_your_query_timestamp.png`

### Option B: Use the Plugin's Basic Screenshot Function

For simpler projects or when you can't run the Node.js tool.

## 4. Using the Figma Plugin

1. Open your Figma file
2. Go to **Plugins > CSV to Screenshots Importer**
3. Follow the step-by-step process in the plugin UI:

   a. **Upload CSV File**:
      - Click "Browse" and select your CSV file
      - Review the CSV preview and click "Load Columns"

   b. **Configure Settings**:
      - Select the column containing search queries
      - Choose your search engine (Google, Bing, DuckDuckGo, Yahoo)
      - Select device mode (Mobile or Desktop)
      - Select additional columns for metadata annotation

   c. **Upload Screenshots** (if you used Option A):
      - Click "Browse" in the "Upload Screenshots" section
      - Navigate to your screenshots folder
      - Use Ctrl+A or Cmd+A to select all screenshot files
      - The plugin will automatically match screenshots to queries based on filenames

   d. **Click "Create Screenshots"**:
      - The plugin will process your data
      - A progress indicator will show the current status
      - Debug information appears at the bottom if there are issues

5. When complete, the plugin will create a frame containing all screenshots with metadata on your Figma canvas

## 5. Output Organization

The plugin creates:
- A main frame containing all screenshots
- Individual cards for each query
- Each card contains:
  - The screenshot image
  - The search URL
  - The query text
  - Additional metadata from selected columns
  - Search engine and device mode information

## 6. Performance Considerations

- The plugin processes up to 3 screenshots in parallel
- Expect about 5 seconds per screenshot on average
- Memory usage is capped at ~200MB for 100 images
- Figma API uploads are throttled to 5 requests/second to respect rate limits

## 7. Troubleshooting

### Common Issues:

1. **CSV parsing errors**:
   - Ensure your CSV file uses commas as separators
   - Check that the header row exists and column names have no special characters
   - Verify that your query column contains non-empty values

2. **Screenshot capture failures**:
   - Check your internet connection
   - Try increasing the delay parameter (--delay=2 or higher)
   - Verify that the chosen search engine is accessible from your network

3. **Plugin image loading issues**:
   - Ensure screenshot files are standard PNG or JPEG format
   - Large images (>4096px in any dimension) will be automatically resized
   - If images fail to load, try using smaller screenshots

4. **Figma plugin crashing**:
   - Process your CSV in smaller batches
   - Reduce the number of screenshots uploaded at once

For additional support, check the debug output in the plugin's loading view or terminal output from the screenshot tool.

## 8. Advanced Usage

### Custom Placement

After the plugin creates the frame with screenshots, you can:
- Move cards individually to arrange them in your design
- Copy individual cards to other frames or pages
- Modify text and screenshot styles as needed

### Batch Processing

For large datasets (100+ queries):
1. Split your CSV into multiple smaller files
2. Process each file separately
3. Organize the resulting frames in your Figma document 