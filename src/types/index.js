// Types for the CSV to Screenshots Figma plugin
// Constants related to UI layout
export const UI_CONSTANTS = {
    CARD_WIDTH: 800,
    CARD_HEIGHT: 600,
    CARD_PADDING: 40,
    SCREENSHOT_WIDTH: 360,
    SCREENSHOT_HEIGHT: 480,
    TEXT_WIDTH: 400,
    TEXT_OFFSET_X: 400, // SCREENSHOT_WIDTH + 40
    GRID_SPACING: 40,
    CARDS_PER_ROW: 4,
    ROW_HEIGHT: 640, // CARD_HEIGHT + GRID_SPACING
    TEXT_FONT_SIZE: 16,
    TITLE_FONT_SIZE: 24,
    // Figma image size constraints
    MAX_IMAGE_SIZE: 2097152, // 2MB in bytes (Figma limit)
    MAX_IMAGE_DIMENSION: 4096 // Maximum dimension for Figma images
};
