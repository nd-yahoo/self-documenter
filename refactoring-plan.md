# Refactoring Plan for code.ts

## Current Issues
- `code.ts` is 1403 lines long, making it difficult to maintain
- Several utility classes and functions are duplicated
- Code has been organized in src/ directory, but `code.ts` isn't using these modules

## Proposed Changes

### 1. Types
- Move all interfaces to `src/types/index.ts` (already done)
  - QueryColumn
  - AdditionalColumn
  - ScreenshotData
  - PluginMessage

### 2. Constants
- Move all constants to `src/constants.ts`
  - UI layout constants (CARD_WIDTH, CARD_HEIGHT, etc.)
  - Figma constraints (MAX_IMAGE_SIZE, MAX_IMAGE_DIMENSION)

### 3. Utility Classes
- Use existing implementations:
  - `RateLimiter` → `src/utils/RateLimiter.ts`
  - `MemoryManager` → `src/utils/MemoryManager.ts`
  - `ErrorTracker` → `src/utils/ErrorTracker.ts`

### 4. Helper Functions
- Move to appropriate utility files:
  - `createFigmaImageWithMemoryManagement` → `src/utils/imageUtils.ts`
  - `resizeImageBytes` → `src/utils/imageUtils.ts`
  - `processFigmaImage` → `src/utils/imageUtils.ts`
  - `parseCSV` → `src/utils/csvUtils.ts`
  - `createTextNode`, `createFrame` → `src/utils/figmaUtils.ts` (new file)
  - `notifyUser` → `src/utils/notifications.ts`
  - `getSearchUrl` → `src/utils/urlUtils.ts` (new file)
  - `getCurrentPage` → `src/utils/figmaUtils.ts`

### 5. Core Functionality
- Split process functions into smaller components:
  - `src/services/csvProcessor.ts` - For main CSV processing
  - `src/services/screenshotManager.ts` - For screenshot handling
  - `src/services/figmaRenderer.ts` - For Figma node creation/manipulation

### 6. Main File
- Refactor `code.ts` to be a thin entry point that:
  - Imports from other modules
  - Sets up plugin event handlers
  - Delegates work to service modules

## Implementation Steps
1. First ensure all utility modules are up to date
2. Create any missing utility files
3. Create the core service modules
4. Refactor the main code.ts file to use all the modules
5. Test functionality thoroughly

## Benefits
- Improved maintainability through separation of concerns
- Better reusability of common functions
- Easier testing of individual components
- Reduced likelihood of bugs through focused, single-responsibility modules 