// Same query to capture yahoo searches on mobile
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=yahoo --mode=mobile --output=screenshots
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=google --mode=mobile --output=screenshots
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=google --mode=mobile --output=screenshots --use-chrome
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=google --mode=mobile --output=screenshots --compare-mode --quality=85 --use-chrome

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import csvParser from 'csv-parser';
import { chromium, Browser, BrowserContext, devices } from 'playwright';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import ProgressBar from 'progress';

interface Args {
  csvFile: string;
  output: string;
  column?: string;
  engine: 'google' | 'bing' | 'duckduckgo' | 'yahoo';
  delay: number;
  mode: 'mobile' | 'desktop';
  useChrome: boolean;
  compareMode: boolean;
  quality: number;
}

// Main entry point when running in compare mode
async function runCompareMode(args: Args) {
  console.log(`Running in compare mode: Capturing screenshots for Yahoo and ${args.engine}`);
  
  // First run Yahoo (baseline) - always use headless browser for Yahoo
  const yahooArgs = { ...args, engine: 'yahoo' as const, useChrome: false };
  console.log('Capturing Yahoo screenshots with headless browser');
  await generateSearchScreenshots(yahooArgs);
  
  // Then run the specified engine (or Google if Yahoo was specified)
  const compareEngine = args.engine === 'yahoo' ? 'google' : args.engine;
  
  // Only use Chrome for Google searches if requested, otherwise use headless
  const useChrome = compareEngine === 'google' ? args.useChrome : false;
  const compareArgs = { ...args, engine: compareEngine, useChrome };
  
  console.log(`Capturing ${compareEngine} screenshots with ${useChrome ? 'Chrome browser' : 'headless browser'}`);
  await generateSearchScreenshots(compareArgs);
  
  console.log(`Compare mode complete. Screenshots captured for Yahoo and ${compareEngine}`);
}

async function generateSearchScreenshots({ csvFile, output, column, engine, delay, mode, useChrome, quality }: Args) {
  // Create timestamped directory for this run
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .replace(/\..+/, '');
  
  const runDir = `${timestamp}--${engine}`;
  const outputDir = path.join(output, runDir);
  
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`Saving screenshots to: ${outputDir}`);

  // Read and parse CSV
  const queries: string[] = [];
  const headers: string[] = [];
  let queryColIndex = 0;

  // First pass: read header
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvFile)
      .pipe(csvParser())
      .on('headers', (hdrs: string[]) => {
        headers.push(...hdrs);
        console.log("CSV Headers found:", headers);
        
        if (column) {
          const idx = Number(column);
          if (!isNaN(idx)) {
            // Using numeric index directly
            queryColIndex = idx;
            console.log(`Using column index ${idx}: "${headers[idx] || 'OUT OF BOUNDS'}"`);
          } else {
            // Try exact match first
            const exactMatch = hdrs.findIndex(h => h.toLowerCase() === column.toLowerCase());
            if (exactMatch >= 0) {
              queryColIndex = exactMatch;
              console.log(`Found exact column name match: "${headers[exactMatch]}" at index ${exactMatch}`);
            } else {
              // Fall back to partial match
              const partialMatch = hdrs.findIndex(h => h.toLowerCase().includes(column.toLowerCase()));
              if (partialMatch >= 0) {
                queryColIndex = partialMatch;
                console.log(`Found partial column name match: "${headers[partialMatch]}" at index ${partialMatch}`);
              } else {
                console.log(`No column match found for "${column}". Using default index 0: "${headers[0] || 'OUT OF BOUNDS'}"`);
              }
            }
          }
        } else {
          // Look for a column named "query" by default
          const queryColMatch = hdrs.findIndex(h => h.toLowerCase() === 'query');
          if (queryColMatch >= 0) {
            queryColIndex = queryColMatch;
            console.log(`Found "query" column at index ${queryColIndex}`);
          } else {
            console.log(`No "query" column found. Using default index 0: "${headers[0] || 'OUT OF BOUNDS'}"`);
          }
        }
        resolve();
      })
      .on('error', reject);
  });

  // Second pass: collect queries
  await pipeline(
    fs.createReadStream(csvFile),
    csvParser(),
    async function* (source) {
      for await (const row of source) {
        const cols = Object.values(row);
        const query = cols[queryColIndex] as string;
        if (query?.trim()) queries.push(query.trim());
      }
    }
  );

  // Initialize progress bar
  const bar = new ProgressBar('  Processing [:bar] :percent :etas - :query', {
    complete: '=',
    incomplete: ' ',
    width: 50,
    total: queries.length,
  });

  // Set up browser context based on chosen mode
  let browser: Browser;
  let context: BrowserContext;
  const deviceName = mode === 'mobile' ? 'mobile' : 'desktop';

  // Only use Chrome for Google searches, even if useChrome is true
  // This helps avoid CAPTCHAs with Google while keeping Yahoo searches fast with headless
  const shouldUseChrome = useChrome && engine === 'google';
  
  if (shouldUseChrome) {
    // Use system Chrome with persistent context
    console.log(`Using system Chrome in ${mode} mode for ${engine} searches`);
    
    // Create a temporary user data directory
    const tempUserDataDir = path.join(process.cwd(), 'chrome-data-dir');
    console.log(`Using temporary Chrome profile directory: ${tempUserDataDir}`);
    fs.mkdirSync(tempUserDataDir, { recursive: true });
    
    if (mode === 'mobile') {
      const iPhone = devices['iPhone 13'];
      context = await chromium.launchPersistentContext(tempUserDataDir, {
        ...iPhone,
        channel: 'chrome',
        headless: false,
        viewport: { ...iPhone.viewport, height: 1800 },
        deviceScaleFactor: 1  // Force 1:1 pixel ratio
      });
      browser = context.browser() as Browser;
    } else {
      context = await chromium.launchPersistentContext(tempUserDataDir, {
        channel: 'chrome',
        headless: false,
        viewport: { width: 1920, height: 1800 },
        deviceScaleFactor: 1  // Force 1:1 pixel ratio
      });
      browser = context.browser() as Browser;
    }
  } else {
    // Use regular headless browser
    console.log(`Using headless browser in ${mode} mode for ${engine} searches`);
    browser = await chromium.launch({ headless: true });
    
    if (mode === 'mobile') {
      const iPhone = devices['iPhone 13'];
      context = await browser.newContext({
        ...iPhone,
        viewport: { ...iPhone.viewport, height: 1800 },
        deviceScaleFactor: 1,  // Force 1:1 pixel ratio
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        permissions: ['geolocation'],
        geolocation: { latitude: 37.774929, longitude: -122.419416 },
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
      });
    } else {
      context = await browser.newContext({
        viewport: { width: 1920, height: 1800 },
        deviceScaleFactor: 1,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        permissions: ['geolocation'],
        geolocation: { latitude: 37.774929, longitude: -122.419416 },
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
      });
    }
  }

  // Process queries in batches
  const batchSize = useChrome ? 1 : 3; // Only process 1 page at a time when using real Chrome to avoid overwhelming
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchPromises = batch.map((query, batchIndex) => processQuery(
      query, 
      i + batchIndex, 
      engine, 
      deviceName, 
      context, 
      outputDir, 
      delay,
      useChrome,
      quality,
      bar
    ));
    
    await Promise.all(batchPromises);
    // console.log(`Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(queries.length / batchSize)}`); // Replaced by progress bar
  }

  await context.close();
  if (!useChrome) {
    await browser.close(); // Don't close the browser when using persistent context
  }
  
  console.log(`All screenshots saved to: ${outputDir}`);
}

async function processQuery(
  query: string, 
  index: number, 
  engine: string, 
  deviceName: string, 
  context: BrowserContext, 
  output: string, 
  delay: number,
  useChrome: boolean,
  quality: number,
  bar: ProgressBar
): Promise<void> {
  // Format safe filename from query
  const safeQuery = query.replace(/[^a-z0-9 _]/gi, '_').slice(0, 40).trim();
  
  // Create a cleaner filename format - use jpg extension for smaller file size
  const filename = `${String(index + 1).padStart(3, '0')}_${engine}_${deviceName}_${safeQuery}.jpg`;
  const filepath = path.join(output, filename);

  let retries = 0;
  const maxRetries = 2;
  let success = false;

  while (retries <= maxRetries && !success) {
    const page = await context.newPage();
    try {
      // Add random mouse movements and scrolling to mimic human behavior
      // await page.mouse.move(Math.random() * 500, Math.random() * 500);
      
      let url: string;
      switch (engine) {
        case 'bing':
          url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
          break;
        case 'duckduckgo':
          url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
          break;
        case 'yahoo':
          url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
          break;
        case 'google':
          url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          break;
        case 'yahoo':
        default:
          url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
      }
      
      await page.goto(url);
      
      // Add random wait time between navigation and interactions
      const randomWait = Math.floor(500 + Math.random() * 1000);
      await page.waitForTimeout(randomWait);
      
      // Perform some random scrolling to appear more human-like
      // await page.evaluate(() => {
      //   window.scrollBy(0, 100 + Math.random() * 300);
      //   return new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
      // });
      
      await page.waitForLoadState('networkidle');
      
      // Check if CAPTCHA is present
      const hasCaptcha = await page.evaluate(() => {
        return document.body.textContent?.includes('CAPTCHA') || 
               document.body.textContent?.includes('unusual traffic') ||
               document.body.textContent?.includes('verify you are a human') ||
               !!document.querySelector('iframe[src*="recaptcha"]') ||
               !!document.querySelector('div.g-recaptcha');
      });
      
      if (hasCaptcha) {
        if (useChrome) {
          console.log(`CAPTCHA detected for query "${query}". Since you're using system Chrome, please solve the CAPTCHA manually.`);
          console.log('Waiting 30 seconds for you to solve the CAPTCHA...');
          await page.waitForTimeout(30000); // Wait 30 seconds for manual CAPTCHA solving
        } else {
          bar.interrupt(`CAPTCHA detected for query "${query}". Switching to another search engine...`);
          retries++;
          continue;
        }
      }
      
      await page.waitForTimeout(delay * 1000);
      
      // Take screenshot with quality parameter to reduce file size (JPEG)
      await page.screenshot({ 
        path: filepath, 
        fullPage: false,
        type: 'jpeg',
        quality: quality,
        clip: {
          x: 0,
          y: 0,
          width: deviceName === 'mobile' ? page.viewportSize()?.width || 390 : 1920,
          height: 1800  // Increased to 1800px with deviceScaleFactor: 1
        }
      });
      
      // Log device pixel ratio and dimensions to verify scaling is working correctly
      bar.interrupt(`Screenshot saved: ${filepath}`);
      bar.interrupt(`Requested dimensions: ${deviceName === 'mobile' ? page.viewportSize()?.width || 390 : 1920}x1800`);
      bar.interrupt(`Device pixel ratio: 1 (forced via deviceScaleFactor)`);
      
      success = true;
    } catch (err) {
      retries++;
      if (retries <= maxRetries) {
        bar.interrupt(`Attempt ${retries}/${maxRetries} failed for query '${query}'. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      } else {
        bar.interrupt(`Failed to process query '${query}' after ${maxRetries} retries: ${err}`);
      }
    } finally {
      await page.close();
    }
  }
  bar.tick({ query: query.length > 20 ? query.substring(0, 17) + "..." : query });
}

(async () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <csv_file> [options]')
    .option('output', {
      alias: 'o',
      type: 'string',
      default: 'search_screenshots',
      description: 'Directory to save screenshots',
    })
    .option('column', {
      alias: 'c',
      type: 'string',
      description: 'Column name (e.g., "query") or index containing search terms',
    })
    .option('engine', {
      alias: 'e',
      choices: ['google', 'bing', 'duckduckgo', 'yahoo'] as const,
      default: 'yahoo',
      description: 'Search engine to use',
    })
    .option('delay', {
      alias: 'd',
      type: 'number',
      default: 1,
      description: 'Delay in seconds before screenshot',
    })
    .option('mode', {
      alias: 'm',
      choices: ['mobile', 'desktop'] as const,
      default: 'mobile',
      description: 'Device mode: mobile or desktop',
    })
    .option('use-chrome', {
      type: 'boolean',
      default: false,
      description: 'Use system Chrome browser for Google searches (helps avoid CAPTCHAs)',
    })
    .option('compare-mode', {
      type: 'boolean',
      default: false,
      description: 'Capture both Yahoo screenshots and the specified engine for comparison',
    })
    .option('quality', {
      type: 'number',
      default: 80,
      description: 'JPEG quality (1-100, lower values = smaller files)',
    })
    .example('$0 data.csv --column="query"', 'Screenshot search terms from the "query" column')
    .example('$0 data.csv --column=2', 'Screenshot search terms from the 3rd column (index 2)')
    .example('$0 data.csv --use-chrome', 'Screenshot using system Chrome browser')
    .example('$0 data.csv --compare-mode --engine=google', 'Capture both Yahoo and Google screenshots')
    .example('$0 data.csv --quality=60', 'Use lower quality (60%) for smaller file sizes')
    .demandCommand(1)
    .parseSync();

  // Type assertion with safety check
  const parsedArgv = argv as unknown as Args & { _: string[] };
  const csvFile = parsedArgv._[0];

  // Build the full args object
  const args: Args = {
    csvFile,
    output: parsedArgv.output,
    column: parsedArgv.column,
    engine: parsedArgv.engine as 'google' | 'bing' | 'duckduckgo' | 'yahoo',
    delay: parsedArgv.delay,
    mode: parsedArgv.mode as 'mobile' | 'desktop',
    useChrome: parsedArgv.useChrome,
    compareMode: parsedArgv.compareMode,
    quality: parsedArgv.quality
  };

  if (args.compareMode) {
    await runCompareMode(args);
  } else {
    await generateSearchScreenshots(args);
  }
})();