/**
 * Helper functions for creating Figma UI elements
 */

/**
 * Create a text node with error handling
 * 
 * @param text Text content for the node
 * @param options Optional configuration for the text node
 * @returns Promise resolving to a TextNode
 */
export async function createTextNode(text: string, options: {
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: RGB | RGBA;
  parent?: BaseNode & ChildrenMixin;
  name?: string;
} = {}): Promise<TextNode> {
  try {
    // Create text node
    const textNode = figma.createText();
    
    // Set name if specified
    if (options.name) {
      textNode.name = options.name;
    }
    
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

/**
 * Create a frame with error handling
 * 
 * @param options Optional configuration for the frame
 * @returns FrameNode
 */
export function createFrame(options: {
  name?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  fill?: RGB | RGBA;
  cornerRadius?: number;
  parent?: BaseNode & ChildrenMixin;
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

/**
 * Helper function to ensure we're working with the current page
 * 
 * @returns Promise resolving to a PageNode
 */
export async function getCurrentPage(): Promise<PageNode> {
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