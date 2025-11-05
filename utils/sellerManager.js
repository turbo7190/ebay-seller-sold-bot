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
    const json = JSON.parse(data);
    return json.sellers || [];
  } catch (error) {
    // If file doesn't exist, return empty array
    if (error.code === "ENOENT") {
      return [];
    }
    console.error("Error loading sellers:", error.message);
    return [];
  }
}

/**
 * Saves sellers to JSON file
 * @param {Array} sellers - Array of seller objects
 * @returns {Promise<boolean>} Success status
 */
async function saveSellers(sellers) {
  try {
    const data = {
      sellers: sellers,
    };
    await fs.writeFile(SELLERS_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving sellers:", error.message);
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
  const sellers = await loadSellers();

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
  const sellers = await loadSellers();
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
  const sellers = await loadSellers();
  if (type) {
    return sellers.filter((s) => s.type === type);
  }
  return sellers;
}

/**
 * Updates seller data
 * @param {string} ssn - Seller SSN/username
 * @param {Object} updates - Updates to apply
 * @param {string} type - Optional: seller type ('listings' or 'sold') to find specific seller
 * @returns {Promise<Object>} Result object
 */
async function updateSeller(ssn, updates, type = null) {
  const sellers = await loadSellers();
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
