const axios = require("axios");

// Rate limiting state per webhook URL
const rateLimitState = new Map();

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles rate limiting with exponential backoff
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Function} sendFunction - Function that sends the webhook
 * @param {number} maxRetries - Maximum number of retries (default: 5)
 * @returns {Promise<boolean>} Success status
 */
async function sendWithRateLimit(webhookUrl, sendFunction, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Check if we're currently rate limited for this webhook
      const state = rateLimitState.get(webhookUrl);
      if (state && state.resetAt > Date.now()) {
        const waitTime = state.resetAt - Date.now();
        console.log(
          `Rate limited for webhook. Waiting ${Math.ceil(
            waitTime / 1000
          )} seconds...`
        );
        await sleep(waitTime);
      }

      const response = await sendFunction();

      // Success - clear any rate limit state
      if (rateLimitState.has(webhookUrl)) {
        rateLimitState.delete(webhookUrl);
      }

      return true;
    } catch (error) {
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        const retryAfter =
          error.response.headers["retry-after"] ||
          error.response.data?.retry_after;

        let waitTime = 5000; // Default 5 seconds

        if (retryAfter) {
          // Retry-After can be in seconds (number) or milliseconds
          waitTime =
            typeof retryAfter === "number" && retryAfter > 1000
              ? retryAfter
              : retryAfter * 1000;
        } else {
          // Exponential backoff: 2^attempt seconds
          waitTime = Math.min(30000, Math.pow(2, attempt) * 1000);
        }

        const resetAt = Date.now() + waitTime;
        rateLimitState.set(webhookUrl, { resetAt });

        console.warn(
          `Rate limited (429) on attempt ${
            attempt + 1
          }/${maxRetries}. Waiting ${Math.ceil(
            waitTime / 1000
          )} seconds before retry...`
        );

        if (attempt < maxRetries - 1) {
          await sleep(waitTime);
          continue; // Retry
        } else {
          console.error(
            `Failed to send webhook after ${maxRetries} attempts due to rate limiting`
          );
          return false;
        }
      }

      // Handle other errors
      if (attempt === 0) {
        console.error(
          `Error sending webhook: ${error.message}${
            error.response ? ` (Status: ${error.response.status})` : ""
          }`
        );
      }

      // For non-rate-limit errors, don't retry immediately
      if (attempt < maxRetries - 1 && error.response?.status >= 500) {
        // Only retry on server errors (5xx)
        const waitTime = Math.min(10000, Math.pow(2, attempt) * 1000);
        console.warn(
          `Server error (${error.response.status}), retrying in ${Math.ceil(
            waitTime / 1000
          )} seconds...`
        );
        await sleep(waitTime);
        continue;
      }

      return false;
    }
  }

  return false;
}

/**
 * Sends a Discord webhook for new listings
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} listing - Listing object
 * @returns {Promise<boolean>} Success status
 */
async function sendNewListingWebhook(webhookUrl, listing) {
  const embed = {
    title: "🆕 New Listing by Seller",
    color: 0x0251bc, // Green
    image: listing.imageUrl ? { url: listing.imageUrl } : undefined,
    fields: [
      {
        name: "Item Name",
        value: listing.title || "N/A",
        inline: false,
      },
      {
        name: "Price",
        value: listing.price || "N/A",
        inline: true,
      },
      {
        name: "Listed Date",
        value: listing.listedDate || "N/A",
        inline: true,
      },
      {
        name: "Seller",
        value: listing.storeName
          ? `[${
              listing.sellerUsername || listing.storeName
            }](https://www.ebay.com/str/${listing.storeName})`
          : listing.sellerUsername || "N/A",
        inline: true,
      },
      {
        name: "Link",
        value: `[View Item](${listing.link})`,
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  return await sendWithRateLimit(webhookUrl, async () => {
    return await axios.post(webhookUrl, {
      embeds: [embed],
    });
  });
}

/**
 * Sends a Discord webhook for sold items
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} item - Sold item object
 * @param {string} sellerUsername - Seller username
 * @returns {Promise<boolean>} Success status
 */
async function sendSoldItemWebhook(webhookUrl, item, sellerUsername) {
  const embed = {
    title: `💰 New Item Sold by ${sellerUsername}`,
    color: 0x0251bc, // Red
    image: item.imageUrl ? { url: item.imageUrl } : undefined,
    fields: [
      {
        name: "Item Name",
        value: item.title || "N/A",
        inline: false,
      },
      {
        name: "Price",
        value: item.price || "N/A",
        inline: true,
      },
      {
        name: "Sold Date",
        value: item.soldDate || "N/A",
        inline: true,
      },
      {
        name: "Seller Name",
        value: item.storeName
          ? `[${sellerUsername || item.storeName}](https://www.ebay.com/str/${
              item.storeName
            })`
          : sellerUsername || "N/A",
        inline: true,
      },
      {
        name: "Link",
        value: `[View Item](${item.link})`,
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  return await sendWithRateLimit(webhookUrl, async () => {
    return await axios.post(webhookUrl, {
      content: "**New Item Sold by Competitor Seller**",
      embeds: [embed],
    });
  });
}

module.exports = {
  sendNewListingWebhook,
  sendSoldItemWebhook,
};
