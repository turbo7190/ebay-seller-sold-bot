const { chromium } = require("playwright");
const cheerio = require("cheerio");

/**
 * Creates a stealth browser context with anti-detection measures
 * @param {Browser} browser - Playwright browser instance
 * @returns {Promise<BrowserContext>} Browser context with stealth settings
 */
async function createStealthContext(browser) {
  // Get a realistic user agent
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  return await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: userAgent,
    locale: "en-US",
    timezoneId: "America/New_York",
    permissions: ["geolocation"],
    geolocation: { longitude: -74.006, latitude: 40.7128 },
    colorScheme: "light",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
    },
  });
}

/**
 * Retry wrapper function for scraping operations
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} delayMs - Delay between retries in milliseconds (default: 5000)
 * @returns {Promise} Result of the function
 */
async function retryOperation(fn, maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`Retrying in ${delayMs / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Scrapes eBay seller's active listings
 * @param {string} storeName - eBay store name
 * @param {string} ssn - Seller SSN/username
 * @returns {Promise<Array>} Array of listing objects
 */
async function getSellerListingsInternal(storeName, ssn) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
    ],
  });
  const context = await createStealthContext(browser);
  const page = await context.newPage();

  // Remove webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Mock plugins and languages
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);

    // Mock chrome runtime
    window.chrome = {
      runtime: {},
    };
  });

  try {
    // Navigate directly to seller's listings page with URL parameters
    const url = `https://www.ebay.com/sch/i.html?_dkr=1&iconV2Request=true&_blrs=recall_filtering&_ssn=${encodeURIComponent(
      ssn
    )}&store_cat=0&store_name=${encodeURIComponent(storeName)}&_oac=1&_sop=10`;
    console.log(url, "listings url");

    // Navigate directly to the listings page
    await page.goto(url);
    await page.waitForTimeout(8000); // Wait for page to fully load

    // Wait for listings to load
    // await page
    //   .waitForSelector(".srp-results", { timeout: 10000 })
    //   .catch(() => {});

    const html = await page.content();
    const $ = cheerio.load(html);

    const listings = [];

    // Extract listings from the page - try both old and new HTML structures
    $(".s-item, .s-card").each((index, element) => {
      const $item = $(element);

      // Only process items that have the "New Listing" badge
      const hasNewListingBadge = $item.find(".s-card__new-listing").length > 0;
      if (!hasNewListingBadge) {
        return; // Skip items without "New Listing" badge
      }

      // Try new card structure first
      let title = $item
        .find(".s-card__title .su-styled-text.primary")
        .first()
        .text()
        .trim();

      // If no title found, try getting all text and filtering
      if (!title) {
        title = $item
          .find(".s-card__title .su-styled-text")
          .not(".clipped")
          .first()
          .text()
          .trim();
      }

      // Fallback to full title text
      if (!title) {
        title = $item.find(".s-card__title").text().trim();
      }

      // If still no title found, try old structure
      if (!title) {
        title = $item.find(".s-item__title").text().trim();
      }

      // Get link from various possible locations
      let link =
        $item.find(".s-card__link").attr("href") ||
        $item.find("a.s-card__link").attr("href") ||
        $item.find(".su-link").attr("href") ||
        $item.find(".s-card__title").parent("a.su-link").attr("href") ||
        $item.find(".s-item__link").attr("href");

      // Get price from either structure
      let price =
        $item.find(".s-card__price").text().trim() ||
        $item.find(".s-item__price").text().trim();

      // Extract product image
      let imageUrl =
        $item.find(".s-card__image").attr("src") ||
        $item.find(".s-item__image-img").attr("src") ||
        null;

      // Extract listed date (e.g., "Nov-1 23:24")
      // Look for date in the attributes section
      let listedDate = null;
      $item.find(".s-card__attribute-row").each((_, row) => {
        const text = $(row)
          .find(".su-styled-text.secondary.bold.large")
          .text()
          .trim();
        // Check if it matches date pattern like "Nov-1 23:24" or "Today 12:34"
        if (
          text &&
          /^(Today|Yesterday|[A-Za-z]{3}-\d+\s+\d{2}:\d{2})/.test(text)
        ) {
          listedDate = text;
          return false; // break
        }
      });

      // Handle relative URLs
      if (link && !link.startsWith("http")) {
        link = `https://www.ebay.com${link}`;
      }

      const itemId = link ? extractItemId(link) : null;

      if (title && link && itemId) {
        // Clean URL - remove query params but keep base URL
        const cleanLink = link.split("?")[0];
        listings.push({
          itemId,
          title,
          link: cleanLink,
          price,
          sellerUsername: ssn,
          storeName: storeName,
          listedDate,
          imageUrl,
        });
      }
    });

    console.log(`Found ${listings.length} listings for seller ${ssn}`);

    return listings;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Wrapper for getSellerListings with retry logic
 * @param {string} storeName - eBay store name
 * @param {string} ssn - Seller SSN/username
 * @returns {Promise<Array>} Array of listing objects
 */
async function getSellerListings(storeName, ssn) {
  return retryOperation(() => getSellerListingsInternal(storeName, ssn));
}

/**
 * Scrapes eBay seller's sold items (internal)
 * @param {string} storeName - eBay store name
 * @param {string} ssn - Seller SSN/username
 * @returns {Promise<Object>} Seller info and sold items array
 */
async function getSellerSoldItemsInternal(storeName, ssn) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
    ],
  });
  const context = await createStealthContext(browser);
  const page = await context.newPage();

  // Remove webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Mock plugins and languages
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);

    // Mock chrome runtime
    window.chrome = {
      runtime: {},
    };
  });

  try {
    // Navigate directly to seller's sold items page with URL parameters
    const url = `https://www.ebay.com/sch/i.html?_dkr=1&iconV2Request=true&_blrs=recall_filtering&_ssn=${encodeURIComponent(
      ssn
    )}&store_cat=0&store_name=${encodeURIComponent(
      storeName
    )}&_oac=1&LH_Sold=1&LH_Complete=1`;
    console.log(url, "sold items url");

    // Navigate directly to the sold items page
    await page.goto(url);
    await page.waitForTimeout(10000); // Wait for page to fully load

    console.log("page loaded");
    // Extract seller feedback score first
    let html = await page.content();
    let $ = cheerio.load(html);

    const soldItems = [];
    let pageNum = 1;
    let hasMorePages = true;
    let shouldContinuePagination = true;

    // Paginate through all sold items
    while (hasMorePages && shouldContinuePagination) {
      console.log(`Scraping page ${pageNum} of sold items for seller ${ssn}`);

      // First, collect ALL items from current page
      const pageItems = [];
      $(".s-item, .s-card").each((index, element) => {
        const $item = $(element);

        // Try new card structure first
        let title = $item
          .find(".s-card__title .su-styled-text.primary")
          .first()
          .text()
          .trim();

        // If no title found, try getting all text and filtering
        if (!title) {
          title = $item
            .find(".s-card__title .su-styled-text")
            .not(".clipped")
            .first()
            .text()
            .trim();
        }

        // Fallback to full title text
        if (!title) {
          title = $item.find(".s-card__title").text().trim();
        }

        // If still no title found, try old structure
        if (!title) {
          title = $item.find(".s-item__title").text().trim();
        }

        // Get link from various possible locations
        let link =
          $item.find(".s-card__link").attr("href") ||
          $item.find("a.s-card__link").attr("href") ||
          $item.find(".su-link").attr("href") ||
          $item.find(".s-card__title").parent("a.su-link").attr("href") ||
          $item.find(".s-item__link").attr("href");

        // Get price from either structure
        let price =
          $item.find(".s-card__price").text().trim() ||
          $item.find(".s-item__price").text().trim();

        // Extract product image
        let imageUrl =
          $item.find(".s-card__image").attr("src") ||
          $item.find(".s-item__image-img").attr("src") ||
          null;

        // Extract sold date
        let soldDateText = $item
          .find(".su-styled-text.positive.default")
          .text()
          .trim();

        // Skip if no sold date found
        if (!soldDateText || !soldDateText.includes("Sold")) {
          return; // Skip this item
        }

        // Handle relative URLs
        if (link && !link.startsWith("http")) {
          link = `https://www.ebay.com${link}`;
        }

        const itemId = link ? extractItemId(link) : null;

        // Check if item is marked as sold (for sold items page, all items should be sold)
        const soldText = $item.text().toLowerCase();
        if (
          title &&
          link &&
          itemId &&
          (soldText.includes("sold") || soldText.includes("ended"))
        ) {
          pageItems.push({
            itemId,
            title,
            link,
            price,
            sellerUsername: ssn,
            storeName: storeName,
            imageUrl,
            soldDate: soldDateText,
          });
        }
      });

      // Now process all collected items and check dates
      // Only continue to next page if the last item on current page is within range
      let lastItemInRange = false;
      for (let i = 0; i < pageItems.length; i++) {
        const item = pageItems[i];
        // Parse and check if sold within last 2 days
        let soldWithinTwoDays = false;
        if (item.soldDate && item.soldDate.includes("Sold")) {
          try {
            // Extract date from "Sold  Nov 2, 2025"
            const dateMatch = item.soldDate.match(
              /Sold\s+([A-Za-z]+\s+\d+,\s+\d{4})/
            );
            if (dateMatch) {
              console.log(dateMatch[1], "dateMatch[1]");
              const soldDate = new Date(dateMatch[1]);
              const currentDate = new Date();
              const diffTime = currentDate - soldDate;
              const diffDays = diffTime / (1000 * 60 * 60 * 24);
              soldWithinTwoDays = diffDays <= 2;
            } else {
              // If date parsing fails, include the item anyway
              soldWithinTwoDays = true;
            }
          } catch (error) {
            // If date parsing fails, include the item anyway
            soldWithinTwoDays = true;
          }
        }

        // Only add items sold within last 2 days
        if (soldWithinTwoDays) {
          // Clean URL - remove query params but keep base URL
          const cleanLink = item.link.split("?")[0];
          soldItems.push({
            itemId: item.itemId,
            title: item.title,
            link: cleanLink,
            price: item.price,
            sellerUsername: ssn,
            storeName: storeName,
            imageUrl: item.imageUrl,
            soldDate: item.soldDate,
          });

          // Track if this is the last item and it's in range
          if (i === pageItems.length - 1) {
            lastItemInRange = true;
          }
        } else {
          // Found an item older than 2 days
          // If this is the last item, we should stop pagination
          if (i === pageItems.length - 1) {
            lastItemInRange = false;
          }
          // Continue processing other items on this page even if one is out of range
        }
      }

      // Only continue to next page if the last item on this page was within range
      // This means all items on current page were within range, so there might be more
      if (!lastItemInRange) {
        shouldContinuePagination = false;
        console.log(
          "Stopped pagination: Found items older than 2 days on page",
          pageNum
        );
      }

      // Check for next page button only if we should continue
      if (shouldContinuePagination) {
        try {
          const nextButton = await page
            .locator(
              'a.pagination__next.icon-link[aria-label="Go to next search page"]'
            )
            .first();
          if (await nextButton.isVisible({ timeout: 5000 })) {
            await nextButton.click();
            await page
              .waitForLoadState("networkidle", { timeout: 10000 })
              .catch(() => {});
            // Re-load the HTML for the new page
            html = await page.content();
            $ = cheerio.load(html);
            pageNum++;
          } else {
            hasMorePages = false;
          }
        } catch (error) {
          hasMorePages = false;
        }
      }
    }

    console.log(`Found ${soldItems.length} total sold items for seller ${ssn}`);

    return {
      sellerUsername: ssn,
      storeName: storeName,
      soldItems,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Wrapper for getSellerSoldItems with retry logic
 * @param {string} storeName - eBay store name
 * @param {string} ssn - Seller SSN/username
 * @returns {Promise<Object>} Seller info and sold items array
 */
async function getSellerSoldItems(storeName, ssn) {
  return retryOperation(() => getSellerSoldItemsInternal(storeName, ssn));
}

/**
 * Extracts item ID from eBay URL
 * @param {string} url - eBay item URL
 * @returns {string|null} Item ID
 */
function extractItemId(url) {
  if (!url) return null;

  // Try to extract from URL patterns like /itm/123456789
  const match = url.match(/\/itm\/(\d+)/);
  if (match) {
    return match[1];
  }

  // Try to extract from query parameters
  try {
    // Handle relative URLs
    const fullUrl = url.startsWith("http") ? url : `https://www.ebay.com${url}`;
    const urlObj = new URL(fullUrl);
    const itemId =
      urlObj.searchParams.get("_id") ||
      urlObj.searchParams.get("item") ||
      urlObj.searchParams.get("itm");
    return itemId || null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  getSellerListings,
  getSellerSoldItems,
};
