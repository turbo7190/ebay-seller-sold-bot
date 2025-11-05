// API Base URL
const API_BASE = window.location.origin;

// State
let listingSellers = [];
let soldSellers = [];

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadWebhooks();
  loadSellers();
  setupFormHandlers();
});

// Setup form handlers
function setupFormHandlers() {
  const form = document.getElementById("addSellerForm");
  form.addEventListener("submit", handleAddSeller);
}

// Load webhook status
async function loadWebhooks() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/webhooks`);
    const data = await response.json();

    if (data.success) {
      const listingsStatus = document.getElementById("listingsStatus");
      const soldStatus = document.getElementById("soldStatus");

      listingsStatus.textContent =
        data.webhookUrlListings === "***configured***"
          ? "Configured"
          : "Not Set";
      listingsStatus.className = `status-value ${
        data.webhookUrlListings === "***configured***"
          ? "configured"
          : "not-set"
      }`;

      soldStatus.textContent =
        data.webhookUrlSold === "***configured***" ? "Configured" : "Not Set";
      soldStatus.className = `status-value ${
        data.webhookUrlSold === "***configured***" ? "configured" : "not-set"
      }`;
    }
  } catch (error) {
    console.error("Error loading webhooks:", error);
  }
}

// Load sellers
async function loadSellers() {
  try {
    // Load listing sellers
    const listingResponse = await fetch(
      `${API_BASE}/api/admin/sellers?type=listings`
    );
    const listingData = await listingResponse.json();

    // Load sold sellers
    const soldResponse = await fetch(`${API_BASE}/api/admin/sellers?type=sold`);
    const soldData = await soldResponse.json();

    if (listingData.success) {
      listingSellers = listingData.sellers || [];
    }

    if (soldData.success) {
      soldSellers = soldData.sellers || [];
    }

    renderSellers();
    updateSellerCounts();
  } catch (error) {
    console.error("Error loading sellers:", error);
    showMessage("Error loading sellers", "error");
  }
}

// Render sellers
function renderSellers() {
  // Render listing sellers
  const listingContainer = document.getElementById("listingSellersContainer");
  if (listingSellers.length === 0) {
    listingContainer.innerHTML = `
            <div class="empty-state">
                <p>No listing sellers</p>
                <p style="font-size: 0.9em; opacity: 0.7;">Add a seller above to monitor new listings</p>
            </div>
        `;
  } else {
    listingContainer.innerHTML = listingSellers
      .map(
        (seller) => `
            <div class="seller-card">
                <div class="seller-info">
                    <div class="seller-name">${escapeHtml(
                      seller.storeName || seller.ssn || seller.username
                    )}</div>
                    <div class="seller-meta">
                        ${
                          seller.ssn
                            ? `<span>SSN: ${escapeHtml(seller.ssn)}</span>`
                            : ""
                        }
                        ${
                          seller.storeName
                            ? `<span>Store: ${escapeHtml(
                                seller.storeName
                              )}</span>`
                            : ""
                        }
                        <span>Added: ${formatDate(seller.addedAt)}</span>
                        ${
                          seller.lastCheckedListings
                            ? `<span>Last checked: ${formatDate(
                                seller.lastCheckedListings
                              )}</span>`
                            : ""
                        }
                    </div>
                </div>
                <div class="seller-actions">
                    <button class="btn btn-danger" onclick="removeSeller('${escapeHtml(
                      seller.ssn || seller.username
                    )}', 'listings')">
                        Remove
                    </button>
                </div>
            </div>
        `
      )
      .join("");
  }

  // Render sold sellers
  const soldContainer = document.getElementById("soldSellersContainer");
  if (soldSellers.length === 0) {
    soldContainer.innerHTML = `
            <div class="empty-state">
                <p>No sold sellers</p>
                <p style="font-size: 0.9em; opacity: 0.7;">Add a seller above to monitor sold items</p>
            </div>
        `;
  } else {
    soldContainer.innerHTML = soldSellers
      .map(
        (seller) => `
            <div class="seller-card">
                <div class="seller-info">
                    <div class="seller-name">${escapeHtml(
                      seller.storeName || seller.ssn || seller.username
                    )}</div>
                    <div class="seller-meta">
                        ${
                          seller.ssn
                            ? `<span>SSN: ${escapeHtml(seller.ssn)}</span>`
                            : ""
                        }
                        ${
                          seller.storeName
                            ? `<span>Store: ${escapeHtml(
                                seller.storeName
                              )}</span>`
                            : ""
                        }
                        <span>Added: ${formatDate(seller.addedAt)}</span>
                        ${
                          seller.lastCheckedSold
                            ? `<span>Last checked: ${formatDate(
                                seller.lastCheckedSold
                              )}</span>`
                            : ""
                        }
                    </div>
                </div>
                <div class="seller-actions">
                    <button class="btn btn-danger" onclick="removeSeller('${escapeHtml(
                      seller.ssn || seller.username
                    )}', 'sold')">
                        Remove
                    </button>
                </div>
            </div>
        `
      )
      .join("");
  }
}

// Update seller counts
function updateSellerCounts() {
  document.getElementById(
    "listingSellerCount"
  ).textContent = `(${listingSellers.length})`;
  document.getElementById(
    "soldSellerCount"
  ).textContent = `(${soldSellers.length})`;
}

// Handle add seller
async function handleAddSeller(e) {
  e.preventDefault();

  const form = e.target;
  const storeNameInput = document.getElementById("storeName");
  const ssnInput = document.getElementById("sellerSSN");
  const typeSelect = document.getElementById("sellerType");
  const storeName = storeNameInput.value.trim();
  const ssn = ssnInput.value.trim();
  const type = typeSelect.value;

  if (!storeName || !ssn) {
    showMessage("Please enter both Store Name and SSN", "error");
    return;
  }

  // Disable form
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Adding...";

  try {
    const response = await fetch(`${API_BASE}/api/admin/sellers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ storeName, ssn, type }),
    });

    const data = await response.json();

    if (data.success) {
      const typeLabel = type === "listings" ? "listings" : "sold items";
      showMessage(
        `Seller "${ssn}" added successfully for ${typeLabel} monitoring!`,
        "success"
      );
      storeNameInput.value = "";
      ssnInput.value = "";
      // Reload sellers
      setTimeout(() => {
        loadSellers();
        loadWebhooks(); // Reload webhooks in case monitoring restarted
      }, 500);
    } else {
      showMessage(
        data.message || data.error || "Failed to add seller",
        "error"
      );
    }
  } catch (error) {
    console.error("Error adding seller:", error);
    showMessage("Error adding seller. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Add Seller";
  }
}

// Remove seller
async function removeSeller(ssn, type) {
  const typeLabel = type === "listings" ? "listings" : "sold items";
  if (
    !confirm(
      `Are you sure you want to remove "${ssn}" from ${typeLabel} monitoring?`
    )
  ) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/admin/sellers/${encodeURIComponent(ssn)}?type=${type}`,
      {
        method: "DELETE",
      }
    );

    const data = await response.json();

    if (data.success) {
      showMessage(
        `Seller "${ssn}" removed successfully from ${typeLabel} monitoring!`,
        "success"
      );
      // Reload sellers
      setTimeout(() => {
        loadSellers();
        loadWebhooks(); // Reload webhooks in case monitoring restarted
      }, 500);
    } else {
      showMessage(
        data.message || data.error || "Failed to remove seller",
        "error"
      );
    }
  } catch (error) {
    console.error("Error removing seller:", error);
    showMessage("Error removing seller. Please try again.", "error");
  }
}

// Show message
function showMessage(message, type) {
  const messageEl = document.getElementById("addMessage");
  messageEl.textContent = message;
  messageEl.className = `message ${type}`;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageEl.className = "message";
    messageEl.textContent = "";
  }, 5000);
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  return date.toLocaleString();
}
