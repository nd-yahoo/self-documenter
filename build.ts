/**
 * This is the main entry point for the Figma plugin.
 * The actual implementation has been refactored into a modular structure
 * in the src/ directory for better maintainability.
 * 
 * This file will replace code.ts after compiling.
 */

// Import and execute the main entry point
import './src/index';

// Re-export types in case external code depends on them
export * from './src/types';
export * from './src/utils/RateLimiter';
export * from './src/utils/MemoryManager';
export * from './src/utils/ErrorTracker';
export * from './src/utils/notifications';
export * from './src/utils/CsvUtils';
export * from './src/utils/imageUtils';
export * from './src/ui/figmaElements';
export * from './src/services/csvProcessor'; 