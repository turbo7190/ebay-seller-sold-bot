const axios = require("axios");

/**
 * Sends a Discord webhook for new listings
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} listing - Listing object
 * @returns {Promise<boolean>} Success status
 */
async function sendNewListingWebhook(webhookUrl, listing) {
  try {
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
          value: listing.sellerUsername || "N/A",
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

    await axios.post(webhookUrl, {
      embeds: [embed],
    });

    return true;
  } catch (error) {
    console.error("Error sending new listing webhook:", error.message);
    return false;
  }
}

/**
 * Sends a Discord webhook for sold items
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} item - Sold item object
 * @param {string} sellerUsername - Seller username
 * @returns {Promise<boolean>} Success status
 */
async function sendSoldItemWebhook(
  webhookUrl,
  item,
  sellerUsername,
) {
  try {
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
          value: sellerUsername || "N/A",
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

    await axios.post(webhookUrl, {
      content: "**New Item Sold by Competitor Seller**",
      embeds: [embed],
    });

    return true;
  } catch (error) {
    console.error("Error sending sold item webhook:", error.message);
    return false;
  }
}

module.exports = {
  sendNewListingWebhook,
  sendSoldItemWebhook,
};
