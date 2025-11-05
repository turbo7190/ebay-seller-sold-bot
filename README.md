# eBay Seller Monitor Server

Express server that monitors eBay sellers and sends Discord webhooks for new listings and sold items.

## Features

- **eBay Seller Monitoring**: Automatically monitors specified eBay sellers
- **Discord Webhooks**: Sends notifications for new listings and sold items
- **Admin API**: Add/remove sellers and manage webhook URLs
- **Automated Scraping**: Uses Playwright to scrape eBay seller pages
- **Auto-restart with nodemon** for development

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Install Playwright browsers (first time setup):

```bash
npx playwright install
```

## Usage

### Start the Server

Development mode (with auto-reload):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

Server will run on `http://localhost:4000` (or PORT specified in .env)

### Run Tests

Run all tests:

```bash
npm test
```

Run tests in headed mode (see browser):

```bash
npm run test:headed
```

Run tests with UI mode:

```bash
npm run test:ui
```

Debug tests:

```bash
npm run test:debug
```

### View Test Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

## API Endpoints

### General Endpoints

- `GET /` - Welcome message and server status
- `GET /health` - Health check endpoint

### Webhook Configuration

Webhooks are configured using environment variables only. Set them in your `.env` file:

```env
WEBHOOK_URL_LISTINGS=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_FOR_LISTINGS
WEBHOOK_URL_SOLD=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_FOR_SOLD_ITEMS
```

#### Check Webhook Configuration

```
GET /api/admin/webhooks
```

Returns the current webhook configuration status (read-only).

**Response:**

```json
{
  "success": true,
  "webhookUrlListings": "***configured***",
  "webhookUrlSold": "***configured***",
  "note": "Configure webhooks using environment variables: WEBHOOK_URL_LISTINGS and WEBHOOK_URL_SOLD"
}
```

### Seller Management Endpoints

#### Get All Monitored Sellers

```
GET /api/admin/sellers
```

Returns a list of all sellers being monitored.

**Response:**

```json
{
  "success": true,
  "count": 2,
  "sellers": [
    {
      "username": "example_seller",
      "lastCheckedListings": "2024-01-01T12:00:00.000Z",
      "lastCheckedSold": "2024-01-01T12:00:00.000Z",
      "addedAt": "2024-01-01T10:00:00.000Z"
    }
  ]
}
```

#### Add a Seller to Monitor

```
POST /api/admin/sellers
Content-Type: application/json

{
  "username": "seller_username"
}
```

**Example using curl:**

```bash
curl -X POST http://localhost:4000/api/admin/sellers \
  -H "Content-Type: application/json" \
  -d '{
    "username": "example_seller"
  }'
```

**Note:** When you add a seller, monitoring automatically restarts to begin checking the new seller immediately.

#### Remove a Seller

```
DELETE /api/admin/sellers/:username
```

**Example:**

```bash
curl -X DELETE http://localhost:4000/api/admin/sellers/example_seller
```

**Note:** When you remove a seller, monitoring automatically restarts.

#### Manually Check a Seller (Testing)

```
POST /api/admin/check/:username
```

Manually triggers a check for a specific seller (useful for testing).

## Test Structure

- `tests/example.spec.js` - API tests using Playwright's request API
- `tests/example-browser.spec.js` - Browser-based tests

## Environment Variables

Create a `.env` file to configure:

```env
PORT=4000
NODE_ENV=development
MONITOR_INTERVAL=300000
WEBHOOK_URL_LISTINGS=https://discord.com/api/webhooks/...
WEBHOOK_URL_SOLD=https://discord.com/api/webhooks/...
```

- `PORT`: Server port (default: 4000)
- `NODE_ENV`: Environment (development/production)
- `MONITOR_INTERVAL`: How often to check sellers in milliseconds (default: 300000 = 5 minutes)
- `WEBHOOK_URL_LISTINGS`: Global webhook URL for new listings (required for new listing notifications)
- `WEBHOOK_URL_SOLD`: Global webhook URL for sold items (required for sold item notifications)

## Project Structure

```
ebay-server/
├── server.js                 # Express server with monitoring
├── sellers.json              # Seller data (auto-generated, gitignored)
├── utils/
│   ├── scraper.js           # eBay scraping functions
│   ├── webhooks.js          # Discord webhook sender
│   └── sellerManager.js     # Seller CRUD operations
├── playwright.config.js      # Playwright configuration
├── package.json              # Dependencies and scripts
├── tests/                    # Test files
│   ├── example.spec.js       # API tests
│   └── example-browser.spec.js  # Browser tests
├── .gitignore
└── README.md
```

## How It Works

1. **Configure Webhooks**: Set up global Discord webhook URLs in your `.env` file
   - `WEBHOOK_URL_LISTINGS`: For new listings from any monitored seller
   - `WEBHOOK_URL_SOLD`: For sold items from any monitored seller
2. **Add Sellers**: Use the admin API to add eBay sellers to monitor
   - When sellers are added or removed, monitoring automatically restarts
3. **Automatic Monitoring**: The server periodically checks all monitored sellers (default: every 5 minutes)
4. **Notifications**: When new listings or sold items are detected, Discord webhooks are sent to the configured global webhooks

**Key Features:**

- **Global Webhooks**: Two pre-built webhooks handle notifications for ALL sellers
- **Auto-Restart**: Monitoring automatically restarts when sellers are added/removed
- **Independent Sellers**: Each seller is monitored independently
- **Multiple Sellers**: Supports monitoring multiple sellers simultaneously

## Discord Webhook Setup

1. Go to your Discord server settings
2. Navigate to Integrations > Webhooks
3. Create a new webhook for listings (Channel 1) - This will receive all new listings from ALL monitored sellers
4. Create another webhook for sold items - This will receive all sold items from ALL monitored sellers
5. Copy the webhook URLs and add them to your `.env` file as `WEBHOOK_URL_LISTINGS` and `WEBHOOK_URL_SOLD`

## Webhook Format

### New Listing Webhook

- Title: "🆕 New Listing by Seller"
- Fields: Item Name, Price, Seller, Link

### Sold Item Webhook

- Title: "💰 New Item Sold by Competitor Seller"
- Content: "**New Item Sold by Competitor Seller**"
- Fields: Item Name, Price, Seller Name, Feedback Score, Link

## Development

The server uses nodemon for automatic restarts during development. Make changes to `server.js` and the server will automatically reload.

## Testing

Playwright is configured to:

- Run tests in parallel
- Retry failed tests in CI environments
- Generate HTML reports
- Capture screenshots and videos on failure
- Automatically start the server before tests
