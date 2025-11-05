const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// Import utilities
const sellerManager = require("./utils/sellerManager");
const scraper = require("./utils/scraper");
const webhooks = require("./utils/webhooks");

// Global variable to trigger monitoring restart
let monitoringActive = true;
let monitoringTimeout = null;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Routes - Serve UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// ========== WEBHOOK CONFIGURATION ENDPOINTS ==========

/**
 * GET /api/admin/webhooks
 * Get current webhook configuration (from environment variables)
 */
app.get("/api/admin/webhooks", async (req, res) => {
  try {
    res.json({
      success: true,
      webhookUrlListings: process.env.WEBHOOK_URL_LISTINGS
        ? "***configured***"
        : "not set",
      webhookUrlSold: process.env.WEBHOOK_URL_SOLD
        ? "***configured***"
        : "not set",
      note: "Configure webhooks using environment variables: WEBHOOK_URL_LISTINGS and WEBHOOK_URL_SOLD",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get webhook configuration",
      message: error.message,
    });
  }
});

// ========== ADMIN ENDPOINTS ==========

/**
 * GET /api/admin/sellers
 * Get all monitored sellers
 */
app.get("/api/admin/sellers", async (req, res) => {
  try {
    const { type } = req.query; // Optional query parameter: ?type=listings or ?type=sold
    const sellers = await sellerManager.getAllSellers(type || null);
    res.json({
      success: true,
      count: sellers.length,
      sellers: sellers.map((s) => ({
        storeName: s.storeName,
        ssn: s.ssn || s.username,
        username: s.username || s.ssn, // Keep for backward compatibility
        type: s.type,
        lastCheckedListings: s.lastCheckedListings,
        lastCheckedSold: s.lastCheckedSold,
        addedAt: s.addedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get sellers",
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/sellers
 * Add a new seller to monitor
 * Body: { storeName, ssn, type }
 */
app.post("/api/admin/sellers", async (req, res) => {
  try {
    const { storeName, ssn, type } = req.body;

    // Trim and validate required fields
    const trimmedStoreName = storeName ? storeName.trim() : "";
    const trimmedSsn = ssn ? ssn.trim() : "";

    if (!trimmedStoreName || !trimmedSsn) {
      return res.status(400).json({
        success: false,
        error: "Both storeName and ssn are required and cannot be empty",
      });
    }

    if (!type || (type !== "listings" && type !== "sold")) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid field: type (must be 'listings' or 'sold')",
      });
    }

    const result = await sellerManager.addSeller(
      trimmedStoreName,
      trimmedSsn,
      type
    );

    if (result.success) {
      // Trigger monitoring restart when seller is added
      triggerMonitoringRestart();
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to add seller",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/admin/sellers/:ssn
 * Remove a seller from monitoring
 */
app.delete("/api/admin/sellers/:ssn", async (req, res) => {
  try {
    const { ssn } = req.params;
    const { type } = req.query; // Query parameter: ?type=listings or ?type=sold

    if (!ssn) {
      return res.status(400).json({
        success: false,
        error: "Missing ssn parameter",
      });
    }

    if (!type || (type !== "listings" && type !== "sold")) {
      return res.status(400).json({
        success: false,
        error:
          "Missing or invalid query parameter: type (must be 'listings' or 'sold')",
      });
    }

    const result = await sellerManager.removeSeller(ssn, type);

    if (result.success) {
      // Trigger monitoring restart when seller is removed
      triggerMonitoringRestart();
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to remove seller",
      message: error.message,
    });
  }
});

/**
 * GET /api/seller-listings
 * Get seller listings by storeName and ssn
 * Query params: storeName, ssn
 */
app.get("/api/seller-listings", async (req, res) => {
  try {
    const { storeName, ssn } = req.query;

    // Trim and validate required fields
    const trimmedStoreName = storeName ? storeName.trim() : "";
    const trimmedSsn = ssn ? ssn.trim() : "";

    if (!trimmedStoreName || !trimmedSsn) {
      return res.status(400).json({
        success: false,
        error:
          "Both storeName and ssn are required query parameters and cannot be empty",
      });
    }

    const listings = await scraper.getSellerListings(
      trimmedStoreName,
      trimmedSsn
    );
    res.json({
      success: true,
      count: listings.length,
      listings: listings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch seller listings",
      message: error.message,
    });
  }
});

/**
 * GET /api/sold-items
 * Get sold items by storeName and ssn
 * Query params: storeName, ssn
 */
app.get("/api/sold-items", async (req, res) => {
  try {
    const { storeName, ssn } = req.query;

    // Trim and validate required fields
    const trimmedStoreName = storeName ? storeName.trim() : "";
    const trimmedSsn = ssn ? ssn.trim() : "";

    if (!trimmedStoreName || !trimmedSsn) {
      return res.status(400).json({
        success: false,
        error:
          "Both storeName and ssn are required query parameters and cannot be empty",
      });
    }

    const soldData = await scraper.getSellerSoldItems(
      trimmedStoreName,
      trimmedSsn
    );
    res.json({
      success: true,
      count: soldData.soldItems.length,
      sellerUsername: soldData.sellerUsername,
      storeName: soldData.storeName,
      soldItems: soldData.soldItems,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch sold items",
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/check/:ssn
 * Manually trigger a check for a specific seller (for testing)
 */
app.post("/api/admin/check/:ssn", async (req, res) => {
  try {
    const { ssn } = req.params;
    const sellers = await sellerManager.getAllSellers();
    const seller = sellers.find((s) => s.ssn === ssn || s.username === ssn);

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: "Seller not found",
      });
    }

    // Check for new listings
    const listings = await scraper.getSellerListings(
      seller.storeName,
      seller.ssn || seller.username
    );
    const newListings = listings.filter(
      (listing) => !seller.knownListings.includes(listing.itemId)
    );

    // Check for sold items
    const soldData = await scraper.getSellerSoldItems(
      seller.storeName,
      seller.ssn || seller.username
    );
    const newSoldItems = soldData.soldItems.filter(
      (item) => !seller.knownSoldItems.includes(item.itemId)
    );

    res.json({
      success: true,
      listings: {
        total: listings.length,
        new: newListings.length,
      },
      soldItems: {
        total: soldData.soldItems.length,
        new: newSoldItems.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to check seller",
      message: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

// ========== MONITORING SERVICE ==========

/**
 * Monitors all sellers for new listings and sold items
 */
async function monitorSellers() {
  if (!monitoringActive) return;

  console.log(`[${new Date().toISOString()}] Starting seller monitoring...`);

  try {
    // Get webhook URLs from environment variables
    const webhookUrlListings = process.env.WEBHOOK_URL_LISTINGS || "";
    const webhookUrlSold = process.env.WEBHOOK_URL_SOLD || "";

    const sellers = await sellerManager.getAllSellers();

    if (sellers.length === 0) {
      console.log("No sellers to monitor");
      return;
    }

    if (!webhookUrlListings && !webhookUrlSold) {
      console.log(
        "No webhooks configured. Please set WEBHOOK_URL_LISTINGS and/or WEBHOOK_URL_SOLD environment variables."
      );
      return;
    }

    // Get sellers by type
    const listingSellers = sellers.filter((s) => s.type === "listings");
    const soldSellers = sellers.filter((s) => s.type === "sold");

    console.log(
      `Monitoring ${listingSellers.length} listing seller(s) and ${soldSellers.length} sold seller(s)...`
    );

    // Monitor listing sellers
    if (webhookUrlListings && listingSellers.length > 0) {
      for (const seller of listingSellers) {
        try {
          const ssn = seller.ssn || seller.username;
          console.log(`Checking listings for seller: ${ssn}`);

          const listings = await scraper.getSellerListings(
            seller.storeName,
            ssn
          );
          const knownListingIds = new Set(seller.knownListings || []);
          const newListings = listings.filter(
            (listing) => !knownListingIds.has(listing.itemId)
          );

          if (newListings.length > 0) {
            console.log(
              `Found ${newListings.length} new listing(s) for ${ssn}`
            );

            for (const listing of newListings) {
              const success = await webhooks.sendNewListingWebhook(
                webhookUrlListings,
                listing
              );
              // Wait 2.5 seconds between requests to avoid rate limits (Discord allows ~30/min)
              // The webhook function will handle rate limit errors with retries
              await new Promise((resolve) => setTimeout(resolve, 2500));
            }

            // Update known listings
            const updatedKnownListings = [
              ...(seller.knownListings || []),
              ...newListings.map((l) => l.itemId),
            ];
            await sellerManager.updateSeller(
              ssn,
              {
                knownListings: updatedKnownListings,
                lastCheckedListings: new Date().toISOString(),
              },
              "listings"
            );
          }

          // Add delay between sellers to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (error) {
          console.error(
            `Error monitoring listing seller ${seller.username}:`,
            error.message
          );
        }
      }
    }

    // Monitor sold sellers
    if (webhookUrlSold && soldSellers.length > 0) {
      for (const seller of soldSellers) {
        try {
          const ssn = seller.ssn || seller.username;
          console.log(`Checking sold items for seller: ${ssn}`);

          const soldData = await scraper.getSellerSoldItems(
            seller.storeName,
            ssn
          );
          const knownSoldItemIds = new Set(seller.knownSoldItems || []);
          const newSoldItems = soldData.soldItems.filter(
            (item) => !knownSoldItemIds.has(item.itemId)
          );

          if (newSoldItems.length > 0) {
            console.log(
              `Found ${newSoldItems.length} new sold item(s) for ${ssn}`
            );

            for (const item of newSoldItems) {
              const success = await webhooks.sendSoldItemWebhook(
                webhookUrlSold,
                item,
                ssn
              );
              // Wait 2.5 seconds between requests to avoid rate limits (Discord allows ~30/min)
              // The webhook function will handle rate limit errors with retries
              await new Promise((resolve) => setTimeout(resolve, 2500));
            }

            // Update known sold items
            const updatedKnownSoldItems = [
              ...(seller.knownSoldItems || []),
              ...newSoldItems.map((i) => i.itemId),
            ];
            await sellerManager.updateSeller(
              ssn,
              {
                knownSoldItems: updatedKnownSoldItems,
                lastCheckedSold: new Date().toISOString(),
              },
              "sold"
            );
          }

          // Add delay between sellers to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (error) {
          console.error(
            `Error monitoring sold seller ${seller.username}:`,
            error.message
          );
        }
      }
    }

    console.log(`[${new Date().toISOString()}] Monitoring cycle complete`);
  } catch (error) {
    console.error("Error in monitoring cycle:", error.message);
  }
}

/**
 * Triggers an immediate monitoring restart
 */
function triggerMonitoringRestart() {
  console.log("Triggering monitoring restart due to configuration change...");
  // Run monitoring immediately
  setTimeout(() => {
    monitorSellers();
  }, 2000); // Small delay to ensure changes are saved
}

// Start monitoring interval
const MONITOR_INTERVAL = parseInt(
  process.env.MONITOR_INTERVAL || "43200000",
  10
); // Default 12 hours (43200000 ms)

let monitoringIntervalId = null;

/**
 * Starts the monitoring interval
 */
function startMonitoring() {
  monitorSellers();

  // Then monitor at regular intervals
  monitoringIntervalId = setInterval(() => {
    monitorSellers();
  }, MONITOR_INTERVAL);

  console.log(
    `Monitoring interval set to ${MONITOR_INTERVAL / 1000 / 60 / 60} hours`
  );
}

// Start monitoring
startMonitoring();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `📊 Monitoring interval: ${MONITOR_INTERVAL / 1000 / 60 / 60} hours`
  );
});

module.exports = app;
