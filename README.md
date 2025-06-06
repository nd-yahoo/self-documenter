# CSV to Screenshots Figma Plugin

This Figma plugin allows you to:
1. Import a CSV file with search queries and additional metadata
2. Generate search engine screenshots for each query
3. Embed the screenshots and metadata in a well-organized Figma document

## Features

- Upload any CSV file and preview its contents
- Select a column to use as search queries
- Choose additional columns to display as text next to screenshots
- Select search engine (Google, Bing, DuckDuckGo, Yahoo)
- Choose device mode (mobile or desktop)
- Automatically create styled frames for each query with screenshots and metadata
- Parallel screenshot processing (up to 3 concurrent captures)
- Automatic retry for failed screenshots (up to 2 retries)
- Rate limiting for Figma API (max 5 requests/second)
- Optimized memory usage for large batches

## Installation

### Prerequisites (for new machines)

1. Install Homebrew:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. Add Homebrew to your path
   ```bash
   echo >> ~/.zprofile
   echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
   eval "$(/opt/homebrew/bin/brew shellenv)"
   ```
3. Install Git:
   ```
   brew install git
   ```
4. Install Node.js and npm:
   ```
   brew install node
   ```
5. Symlink npm and homebrew
   ```bash
   rm '/opt/homebrew/bin/npm'
   brew link --overwrite node
   ```
6. Install Figma desktop app:
   ```
   brew install --cask figma
   ```

### Plugin Setup

1. Change directory to your Mac Desktop
   ```
   cd ~/Desktop/
   ```
2. Clone this repository: 
   ```
   git clone https://github.com/nd-yahoo/self-documenter.git
   cd self-documenter
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Install Playwright browsers:
   ```
   npx playwright install chromium
   ```
5. Build the plugin:
   ```
   npm run build
   ```
6. Open Figma desktop app
7. Go to Plugins > Development > Import plugin from manifest...
8. Select the manifest.json file from this project

## Usage

### In Figma

1. In Figma, select Plugins > CSV to Screenshots Importer
2. Upload your CSV file
3. Select the column containing search queries
4. Choose any additional columns to display as metadata
5. Select your preferred search engine and device mode
6. Click "Create Screenshots" to generate the Figma document

### Command Line Screenshot Tool

You can also use the included command line tool to generate screenshots outside of Figma:

```
npm run screenshot -- ./demo.csv --column="query" --engine=yahoo --mode=mobile --output=screenshots
```

Options:
- `--column, -c`: Column index or name containing queries
- `--engine, -e`: Search engine (google, bing, duckduckgo, yahoo)
- `--mode, -m`: Device mode (mobile, desktop)
- `--delay, -d`: Delay in seconds before capturing screenshot (default: 1)
- `--output, -o`: Output directory for screenshots (default: search_screenshots)

## Development

This plugin uses TypeScript and the Figma Plugin API. The codebase is organized into modules:

### Project Structure

- `code.ts`: Legacy entry point that's maintained for compatibility
- `build.ts`: New modular entry point that imports from the src directory
- `ui.html`: User interface for the plugin
- `search_screenshot.tsx`: Command line screenshot utility using Playwright
- `manifest.json`: Plugin configuration
- `src/`: Modular code structure with:
  - `src/index.ts`: Main entry point for the modular structure
  - `src/types/`: Type definitions and constants
  - `src/utils/`: Utility classes and functions
  - `src/services/`: Core business logic
  - `src/ui/`: UI element creation utilities

### Building and Watching for Changes

```
# Using the legacy monolithic structure:
npm run build    # Build once
npm run watch    # Watch for changes and rebuild

# Using the new modular structure:
npm run build:modular    # Build once using modular structure
npm run watch:modular    # Watch for changes and rebuild using modular structure
```

## Performance

- Screenshots are captured in parallel (3 at a time)
- Each screenshot waits for network idle + configurable delay
- Failed screenshots are retried up to 2 times
- Memory usage is optimized for large batches
- Figma API requests are rate-limited to 5 requests/second

## License

[MIT License](LICENSE)

