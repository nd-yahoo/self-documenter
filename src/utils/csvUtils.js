/**
 * Parse CSV data with error handling and fallbacks
 *
 * @param csvData Raw CSV string data
 * @returns Parsed 2D array of strings representing rows and columns
 */
export function parseCSV(csvData) {
    // Try the simplest approach first - this often works when there are no complex fields
    try {
        // Split by lines and filter out empties
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) {
            console.error("Not enough lines in CSV data - need at least headers and one data row");
            return [];
        }
        // Use a very simple parsing approach first
        const simpleResult = lines.map(line => {
            // Just split by commas - this works for simple CSVs
            return line.split(',').map(cell => cell.trim());
        });
        return simpleResult;
    }
    catch (err) {
        console.error("Simple CSV parsing failed, falling back to more robust method:", err);
        // Fallback to a more sophisticated approach
        try {
            const lines = csvData.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                console.error("Not enough lines in CSV data");
                return [];
            }
            const parseRow = (row) => {
                const cells = [];
                let currentCell = '';
                let inQuotes = false;
                for (let i = 0; i < row.length; i++) {
                    const char = row[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    }
                    else if (char === ',' && !inQuotes) {
                        cells.push(currentCell.trim());
                        currentCell = '';
                    }
                    else {
                        currentCell += char;
                    }
                }
                cells.push(currentCell.trim());
                return cells;
            };
            return lines.map(line => parseRow(line));
        }
        catch (err2) {
            console.error("Both CSV parsing methods failed:", err2);
            // Last resort fallback
            return csvData.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => line.split(','));
        }
    }
}
/**
 * Perform basic validation on CSV data
 *
 * @param csvData Parsed CSV data as 2D array
 * @returns Object with validation results
 */
export function validateCSV(csvData) {
    // Check if we have enough data (headers + at least one row)
    if (!csvData || csvData.length < 2) {
        return {
            valid: false,
            message: 'CSV file must have headers and at least one data row'
        };
    }
    // Get headers
    const headers = csvData[0];
    // Get data rows (excluding header)
    const dataRows = csvData.slice(1);
    return {
        valid: true,
        headers,
        dataRows
    };
}
