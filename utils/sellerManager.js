const fs = require("fs").promises;
const path = require("path");

const SELLERS_FILE = path.join(__dirname, "..", "sellers.json");

/**
 * Loads sellers from JSON file
 * @returns {Promise<Array>} Array of seller objects
 */
async function loadSellers() {
  try {
    const data = await fs.readFile(SELLERS_FILE, "utf8");

    // Check if file is empty or only whitespace
    if (!data || !data.trim()) {
      console.warn("sellers.json is empty, returning empty array");
      return [];
    }

    const json = JSON.parse(data);

    // Validate that sellers is an array
    if (!json || typeof json !== "object") {
      console.error("Invalid JSON structure in sellers.json, expected object");
      throw new Error("Invalid JSON structure");
    }

    if (!Array.isArray(json.sellers)) {
      console.error("Invalid sellers data, expected array");
      throw new Error("Invalid sellers data structure");
    }

    return json.sellers || [];
  } catch (error) {
    // If file doesn't exist, return empty array
    if (error.code === "ENOENT") {
      return [];
    }

    // If JSON parse error, log it but don't clear the file
    if (error instanceof SyntaxError) {
      console.error("JSON parse error in sellers.json:", error.message);
      console.error(
        "File may be corrupted. Please check sellers.json manually."
      );
      throw new Error(
        `Failed to parse sellers.json: ${error.message}. File may be corrupted.`
      );
    }

    console.error("Error loading sellers:", error.message);
    throw error; // Re-throw to prevent clearing file
  }
}

/**
 * Saves sellers to JSON file with atomic write (backup + write)
 * @param {Array} sellers - Array of seller objects
 * @returns {Promise<boolean>} Success status
 */
async function saveSellers(sellers) {
  try {
    // Validate sellers is an array
    if (!Array.isArray(sellers)) {
      console.error("saveSellers: sellers must be an array");
      return false;
    }

    // Create backup before writing
    let backupData = null;
    try {
      const existingData = await fs.readFile(SELLERS_FILE, "utf8");
      backupData = existingData;
    } catch (error) {
      // File doesn't exist yet, that's okay
      if (error.code !== "ENOENT") {
        console.warn("Could not create backup:", error.message);
      }
    }

    const data = {
      sellers: sellers,
    };

    const jsonString = JSON.stringify(data, null, 2);

    // Write to temporary file first, then rename (atomic operation)
    const tempFile = `${SELLERS_FILE}.tmp`;
    await fs.writeFile(tempFile, jsonString, "utf8");

    // Verify the temp file was written correctly
    const verifyData = await fs.readFile(tempFile, "utf8");
    JSON.parse(verifyData); // Will throw if invalid

    // Atomic rename (this should work on most systems)
    await fs.rename(tempFile, SELLERS_FILE);

    return true;
  } catch (error) {
    console.error("Error saving sellers:", error.message);

    // Try to restore backup if it exists
    if (backupData) {
      try {
        await fs.writeFile(SELLERS_FILE, backupData, "utf8");
        console.log("Restored backup of sellers.json");
      } catch (restoreError) {
        console.error("Failed to restore backup:", restoreError.message);
      }
    }

    // Clean up temp file if it exists
    try {
      await fs.unlink(`${SELLERS_FILE}.tmp`).catch(() => {});
    } catch (unlinkError) {
      // Ignore cleanup errors
    }

    return false;
  }
}

/**
 * Adds a seller to monitor
 * @param {string} storeName - eBay store name
 * @param {string} ssn - Seller SSN/username
 * @param {string} type - Seller type: 'listings' or 'sold'
 * @returns {Promise<Object>} Result object
 */
async function addSeller(storeName, ssn, type) {
  let sellers;
  try {
    sellers = await loadSellers();
  } catch (error) {
    return {
      success: false,
      message: `Failed to load sellers: ${error.message}`,
    };
  }

  if (type !== "listings" && type !== "sold") {
    return {
      success: false,
      message: "Type must be either 'listings' or 'sold'",
    };
  }

  // Trim and validate required fields
  const trimmedStoreName = storeName ? storeName.trim() : "";
  const trimmedSsn = ssn ? ssn.trim() : "";

  if (!trimmedStoreName || !trimmedSsn) {
    return {
      success: false,
      message: "Both storeName and ssn are required and cannot be empty",
    };
  }

  // Check if seller already exists for this type (by SSN)
  const existing = sellers.find((s) => s.ssn === trimmedSsn && s.type === type);
  if (existing) {
    return {
      success: false,
      message: `Seller with SSN "${trimmedSsn}" is already being monitored for ${type}`,
    };
  }

  // Add new seller
  const newSeller = {
    storeName: trimmedStoreName,
    ssn: trimmedSsn,
    username: trimmedSsn, // Keep for backward compatibility
    type: type, // 'listings' or 'sold'
    lastCheckedListings: null,
    lastCheckedSold: null,
    knownListings: type === "listings" ? [] : undefined, // Track known listings
    knownSoldItems: type === "sold" ? [] : undefined, // Track known sold items
    addedAt: new Date().toISOString(),
  };

  sellers.push(newSeller);
  const saved = await saveSellers(sellers);

  if (saved) {
    return {
      success: true,
      message: `Seller "${trimmedSsn}" added successfully for ${type} monitoring`,
      seller: newSeller,
    };
  } else {
    return {
      success: false,
      message: "Failed to save seller",
    };
  }
}

/**
 * Removes a seller from monitoring
 * @param {string} ssn - Seller SSN/username
 * @param {string} type - Seller type: 'listings' or 'sold'
 * @returns {Promise<Object>} Result object
 */
async function removeSeller(ssn, type) {
  let sellers;
  try {
    sellers = await loadSellers();
  } catch (error) {
    return {
      success: false,
      message: `Failed to load sellers: ${error.message}`,
    };
  }
  const initialLength = sellers.length;

  // Support both ssn and username for backward compatibility
  const filtered = sellers.filter(
    (s) => !((s.ssn === ssn || s.username === ssn) && s.type === type)
  );

  if (filtered.length === initialLength) {
    return {
      success: false,
      message: `Seller with SSN "${ssn}" not found for ${type} monitoring`,
    };
  }

  const saved = await saveSellers(filtered);

  if (saved) {
    return {
      success: true,
      message: `Seller "${ssn}" removed successfully from ${type} monitoring`,
    };
  } else {
    return {
      success: false,
      message: "Failed to remove seller",
    };
  }
}

/**
 * Gets all monitored sellers
 * @param {string} type - Optional: filter by type ('listings' or 'sold')
 * @returns {Promise<Array>} Array of seller objects
 */
async function getAllSellers(type = null) {
  try {
    const sellers = await loadSellers();
    if (type) {
      return sellers.filter((s) => s.type === type);
    }
    return sellers;
  } catch (error) {
    console.error("Error in getAllSellers:", error.message);
    // Return empty array on error to prevent crashes
    return [];
  }
}

/**
 * Updates seller data
 * @param {string} ssn - Seller SSN/username
 * @param {Object} updates - Updates to apply
 * @param {string} type - Optional: seller type ('listings' or 'sold') to find specific seller
 * @returns {Promise<Object>} Result object
 */
async function updateSeller(ssn, updates, type = null) {
  let sellers;
  try {
    sellers = await loadSellers();
  } catch (error) {
    return {
      success: false,
      message: `Failed to load sellers: ${error.message}`,
    };
  }
  // Find seller by ssn/username and type (if provided)
  const sellerIndex = sellers.findIndex(
    (s) =>
      (s.ssn === ssn || s.username === ssn) && (type ? s.type === type : true)
  );

  if (sellerIndex === -1) {
    return {
      success: false,
      message: `Seller with SSN "${ssn}" not found${
        type ? ` for ${type} monitoring` : ""
      }`,
    };
  }

  sellers[sellerIndex] = {
    ...sellers[sellerIndex],
    ...updates,
  };

  const saved = await saveSellers(sellers);

  if (saved) {
    return {
      success: true,
      message: `Seller "${ssn}" updated successfully`,
      seller: sellers[sellerIndex],
    };
  } else {
    return {
      success: false,
      message: "Failed to update seller",
    };
  }
}

module.exports = {
  addSeller,
  removeSeller,
  getAllSellers,
  updateSeller,
  loadSellers,
};
