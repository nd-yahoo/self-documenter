// Same query to capture yahoo searches on mobile
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=yahoo --mode=mobile --output=screenshots
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=google --mode=mobile --output=screenshots
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=google --mode=mobile --output=screenshots --use-chrome
// npm run screenshot -- ~/Downloads/queries.csv --column="query" --engine=google --mode=mobile --output=screenshots --compare-mode --quality=85
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import csvParser from 'csv-parser';
import { chromium, devices } from 'playwright';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
// Main entry point when running in compare mode
function runCompareMode(args) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Running in compare mode: Capturing screenshots for Yahoo and ${args.engine}`);
        // First run Yahoo (baseline) - always use headless browser for Yahoo
        const yahooArgs = Object.assign(Object.assign({}, args), { engine: 'yahoo', useChrome: false });
        console.log('Capturing Yahoo screenshots with headless browser');
        yield generateSearchScreenshots(yahooArgs);
        // Then run the specified engine (or Google if Yahoo was specified)
        const compareEngine = args.engine === 'yahoo' ? 'google' : args.engine;
        // Only use Chrome for Google searches if requested, otherwise use headless
        const useChrome = compareEngine === 'google' ? args.useChrome : false;
        const compareArgs = Object.assign(Object.assign({}, args), { engine: compareEngine, useChrome });
        console.log(`Capturing ${compareEngine} screenshots with ${useChrome ? 'Chrome browser' : 'headless browser'}`);
        yield generateSearchScreenshots(compareArgs);
        console.log(`Compare mode complete. Screenshots captured for Yahoo and ${compareEngine}`);
    });
}
function generateSearchScreenshots(_a) {
    return __awaiter(this, arguments, void 0, function* ({ csvFile, output, column, engine, delay, mode, useChrome, quality }) {
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
        const queries = [];
        const headers = [];
        let queryColIndex = 0;
        // First pass: read header
        yield new Promise((resolve, reject) => {
            fs.createReadStream(csvFile)
                .pipe(csvParser())
                .on('headers', (hdrs) => {
                headers.push(...hdrs);
                console.log("CSV Headers found:", headers);
                if (column) {
                    const idx = Number(column);
                    if (!isNaN(idx)) {
                        // Using numeric index directly
                        queryColIndex = idx;
                        console.log(`Using column index ${idx}: "${headers[idx] || 'OUT OF BOUNDS'}"`);
                    }
                    else {
                        // Try exact match first
                        const exactMatch = hdrs.findIndex(h => h.toLowerCase() === column.toLowerCase());
                        if (exactMatch >= 0) {
                            queryColIndex = exactMatch;
                            console.log(`Found exact column name match: "${headers[exactMatch]}" at index ${exactMatch}`);
                        }
                        else {
                            // Fall back to partial match
                            const partialMatch = hdrs.findIndex(h => h.toLowerCase().includes(column.toLowerCase()));
                            if (partialMatch >= 0) {
                                queryColIndex = partialMatch;
                                console.log(`Found partial column name match: "${headers[partialMatch]}" at index ${partialMatch}`);
                            }
                            else {
                                console.log(`No column match found for "${column}". Using default index 0: "${headers[0] || 'OUT OF BOUNDS'}"`);
                            }
                        }
                    }
                }
                else {
                    // Look for a column named "query" by default
                    const queryColMatch = hdrs.findIndex(h => h.toLowerCase() === 'query');
                    if (queryColMatch >= 0) {
                        queryColIndex = queryColMatch;
                        console.log(`Found "query" column at index ${queryColIndex}`);
                    }
                    else {
                        console.log(`No "query" column found. Using default index 0: "${headers[0] || 'OUT OF BOUNDS'}"`);
                    }
                }
                resolve();
            })
                .on('error', reject);
        });
        // Second pass: collect queries
        yield pipeline(fs.createReadStream(csvFile), csvParser(), function (source) {
            return __asyncGenerator(this, arguments, function* () {
                var _a, e_1, _b, _c;
                try {
                    for (var _d = true, source_1 = __asyncValues(source), source_1_1; source_1_1 = yield __await(source_1.next()), _a = source_1_1.done, !_a; _d = true) {
                        _c = source_1_1.value;
                        _d = false;
                        const row = _c;
                        const cols = Object.values(row);
                        const query = cols[queryColIndex];
                        if (query === null || query === void 0 ? void 0 : query.trim())
                            queries.push(query.trim());
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = source_1.return)) yield __await(_b.call(source_1));
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            });
        });
        // Set up browser context based on chosen mode
        let browser;
        let context;
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
                context = yield chromium.launchPersistentContext(tempUserDataDir, Object.assign(Object.assign({}, iPhone), { channel: 'chrome', headless: false, viewport: Object.assign(Object.assign({}, iPhone.viewport), { height: 1800 }), deviceScaleFactor: 1 // Force 1:1 pixel ratio
                 }));
                browser = context.browser();
            }
            else {
                context = yield chromium.launchPersistentContext(tempUserDataDir, {
                    channel: 'chrome',
                    headless: false,
                    viewport: { width: 1920, height: 1800 },
                    deviceScaleFactor: 1 // Force 1:1 pixel ratio
                });
                browser = context.browser();
            }
        }
        else {
            // Use regular headless browser
            console.log(`Using headless browser in ${mode} mode for ${engine} searches`);
            browser = yield chromium.launch({ headless: true });
            if (mode === 'mobile') {
                const iPhone = devices['iPhone 13'];
                context = yield browser.newContext(Object.assign(Object.assign({}, iPhone), { viewport: Object.assign(Object.assign({}, iPhone.viewport), { height: 1800 }), deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1', permissions: ['geolocation'], geolocation: { latitude: 37.774929, longitude: -122.419416 }, locale: 'en-US', timezoneId: 'America/Los_Angeles' }));
            }
            else {
                context = yield browser.newContext({
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
            const batchPromises = batch.map((query, batchIndex) => processQuery(query, i + batchIndex, engine, deviceName, context, outputDir, delay, useChrome, quality));
            yield Promise.all(batchPromises);
            console.log(`Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(queries.length / batchSize)}`);
        }
        yield context.close();
        if (!useChrome) {
            yield browser.close(); // Don't close the browser when using persistent context
        }
        console.log(`All screenshots saved to: ${outputDir}`);
    });
}
function processQuery(query, index, engine, deviceName, context, output, delay, useChrome, quality) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        // Format safe filename from query
        const safeQuery = query.replace(/[^a-z0-9 _]/gi, '_').slice(0, 40).trim();
        // Create a cleaner filename format - use jpg extension for smaller file size
        const filename = `${String(index + 1).padStart(3, '0')}_${engine}_${deviceName}_${safeQuery}.jpg`;
        const filepath = path.join(output, filename);
        let retries = 0;
        const maxRetries = 2;
        let success = false;
        while (retries <= maxRetries && !success) {
            const page = yield context.newPage();
            try {
                // Add random mouse movements and scrolling to mimic human behavior
                // await page.mouse.move(Math.random() * 500, Math.random() * 500);
                let url;
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
                yield page.goto(url);
                // Add random wait time between navigation and interactions
                const randomWait = Math.floor(500 + Math.random() * 1000);
                yield page.waitForTimeout(randomWait);
                // Perform some random scrolling to appear more human-like
                // await page.evaluate(() => {
                //   window.scrollBy(0, 100 + Math.random() * 300);
                //   return new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
                // });
                yield page.waitForLoadState('networkidle');
                // Check if CAPTCHA is present
                const hasCaptcha = yield page.evaluate(() => {
                    var _a, _b, _c;
                    return ((_a = document.body.textContent) === null || _a === void 0 ? void 0 : _a.includes('CAPTCHA')) ||
                        ((_b = document.body.textContent) === null || _b === void 0 ? void 0 : _b.includes('unusual traffic')) ||
                        ((_c = document.body.textContent) === null || _c === void 0 ? void 0 : _c.includes('verify you are a human')) ||
                        !!document.querySelector('iframe[src*="recaptcha"]') ||
                        !!document.querySelector('div.g-recaptcha');
                });
                if (hasCaptcha) {
                    if (useChrome) {
                        console.log(`CAPTCHA detected for query "${query}". Since you're using system Chrome, please solve the CAPTCHA manually.`);
                        console.log('Waiting 30 seconds for you to solve the CAPTCHA...');
                        yield page.waitForTimeout(30000); // Wait 30 seconds for manual CAPTCHA solving
                    }
                    else {
                        console.warn(`CAPTCHA detected for query "${query}". Switching to another search engine...`);
                        retries++;
                        continue;
                    }
                }
                yield page.waitForTimeout(delay * 1000);
                // Take screenshot with quality parameter to reduce file size (JPEG)
                yield page.screenshot({
                    path: filepath,
                    fullPage: false,
                    type: 'jpeg',
                    quality: quality,
                    clip: {
                        x: 0,
                        y: 0,
                        width: deviceName === 'mobile' ? ((_a = page.viewportSize()) === null || _a === void 0 ? void 0 : _a.width) || 390 : 1920,
                        height: 1800 // Increased to 1800px with deviceScaleFactor: 1
                    }
                });
                // Log device pixel ratio and dimensions to verify scaling is working correctly
                console.log(`Screenshot saved: ${filepath}`);
                console.log(`Requested dimensions: ${deviceName === 'mobile' ? ((_b = page.viewportSize()) === null || _b === void 0 ? void 0 : _b.width) || 390 : 1920}x1800`);
                console.log(`Device pixel ratio: 1 (forced via deviceScaleFactor)`);
                console.log(`Saved: ${filepath}`);
                success = true;
            }
            catch (err) {
                retries++;
                if (retries <= maxRetries) {
                    console.warn(`Attempt ${retries}/${maxRetries} failed for query '${query}'. Retrying...`);
                    yield new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                }
                else {
                    console.error(`Failed to process query '${query}' after ${maxRetries} retries:`, err);
                }
            }
            finally {
                yield page.close();
            }
        }
    });
}
(() => __awaiter(void 0, void 0, void 0, function* () {
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
        choices: ['google', 'bing', 'duckduckgo', 'yahoo'],
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
        choices: ['mobile', 'desktop'],
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
    const parsedArgv = argv;
    const csvFile = parsedArgv._[0];
    // Build the full args object
    const args = {
        csvFile,
        output: parsedArgv.output,
        column: parsedArgv.column,
        engine: parsedArgv.engine,
        delay: parsedArgv.delay,
        mode: parsedArgv.mode,
        useChrome: parsedArgv.useChrome,
        compareMode: parsedArgv.compareMode,
        quality: parsedArgv.quality
    };
    if (args.compareMode) {
        yield runCompareMode(args);
    }
    else {
        yield generateSearchScreenshots(args);
    }
}))();
