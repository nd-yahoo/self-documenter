import { ScreenshotData } from '../types';
import { UI_CONSTANTS } from '../types';

/**
 * Creates a Figma image from bytes with memory management
 * 
 * @param imageBytes Image data as Uint8Array
 * @param imageId Unique identifier for the image
 * @param memoryManager Memory manager instance
 * @returns Figma Image object
 */
export async function createFigmaImageWithMemoryManagement(
  imageBytes: Uint8Array, 
  imageId: string,
  memoryManager: any
): Promise<Image> {
  try {
    // Check if we already have this image in the cache
    const cachedHash = memoryManager.getImageHash(imageId);
    if (cachedHash) {
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

/**
 * Resize image bytes to fit Figma's constraints
 * 
 * @param imageBytes Image data as Uint8Array
 * @param filename Original filename for the image
 * @returns Resized image data
 */
export async function resizeImageBytes(imageBytes: Uint8Array, filename: string): Promise<Uint8Array> {
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
        const needsResize = img.width > UI_CONSTANTS.MAX_IMAGE_DIMENSION || 
                          img.height > UI_CONSTANTS.MAX_IMAGE_DIMENSION || 
                          imageBytes.length > UI_CONSTANTS.MAX_IMAGE_SIZE;
        
        if (!needsResize) {
          resolve(imageBytes);
          return;
        }
        
        // Calculate new dimensions while maintaining aspect ratio
        let newWidth, newHeight;
        if (img.width > img.height) {
          newWidth = Math.min(img.width, UI_CONSTANTS.MAX_IMAGE_DIMENSION);
          newHeight = Math.round((newWidth / img.width) * img.height);
        } else {
          newHeight = Math.min(img.height, UI_CONSTANTS.MAX_IMAGE_DIMENSION);
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

/**
 * Process image before sending to Figma
 * Checks if image needs resizing and processes accordingly
 * 
 * @param imageData Screenshot data object
 * @returns Processed screenshot data
 */
export async function processFigmaImage(imageData: ScreenshotData): Promise<ScreenshotData> {
  try {
    // Check if the image data is too large
    if (imageData.imageBytes.length > UI_CONSTANTS.MAX_IMAGE_SIZE) {
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

/**
 * Get a search engine URL for a given query
 * 
 * @param query Search query
 * @param engine Search engine name (google, bing, yahoo, etc.)
 * @returns URL string
 */
export function getSearchUrl(query: string, engine: string): string {
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