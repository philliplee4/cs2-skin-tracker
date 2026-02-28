# CS2 Skin Tracker - Skinport Integration

## Overview

This CS2 Skin Tracker now includes **full Skinport API integration** to help you track and find CS2 items matching your specific criteria with real-time pricing data.

## Features

### Core Features
- **Real-time Price Tracking** - Get current market prices from Skinport
- **Smart Filtering** - Filter by price, wear condition, StatTrak, and pattern numbers
- **Automatic Matching** - Automatically find items that match your tracking criteria
- **Live Updates** - Auto-refresh every 5 minutes to get the latest listings
- **Price Statistics** - View cheapest, average, and most expensive prices
- **Direct Links** - Click to view any item directly on Skinport

### Tracking Criteria
You can track items with the following filters:
- **Price Range**: Min/Max price in USD
- **Wear Condition**:
  - Any condition
  - Preset (Factory New, Minimal Wear, Field-Tested, Well-Worn, Battle-Scarred)
  - Custom float range (e.g., 0.00 - 0.07)
- **StatTrak**: Required, None, or Any
- **Pattern Number**: Track specific pattern IDs (e.g., 661 for Blue Gem)
- **Notes**: Add custom notes for your reference

## Quick Start

### 1. Get Your API Credentials
1. Visit [Skinport.com](https://skinport.com) and create an account
2. Go to [API Settings](https://skinport.com/api)
3. Generate a new API key pair (Client ID & Client Secret)

### 2. Configure the App
1. Open your Profile page
2. Click "Configure Skinport API"
3. Enter your Client ID and Client Secret
4. Click "Save Credentials" and test the connection

### 3. Start Tracking
1. Browse the item catalog
2. Click "Track This Item" on any item
3. Set your tracking criteria (price, wear, StatTrak, etc.)
4. Click "Start Tracking"
5. View matches on your Profile page

## File Structure

```
csgo skin tracker/
├── js/
│   ├── skinport-api.js          # Core API integration
│   ├── skinport-ui.js            # UI components and rendering
│   ├── profile.js                # Profile page (updated)
│   ├── api.js                    # Existing skin data API
│   └── ...
├── css/
│   ├── skinport.css              # Skinport-specific styles
│   └── style.css                 # Existing styles
├── SKINPORT_SETUP.md             # Detailed setup guide
├── SKINPORT_EXAMPLES.md          # Code examples
└── README_SKINPORT.md            # This file
```

## Documentation

- **[SKINPORT_SETUP.md](SKINPORT_SETUP.md)** - Complete setup guide with troubleshooting
- **[SKINPORT_EXAMPLES.md](SKINPORT_EXAMPLES.md)** - Code examples and usage patterns

## How It Works

### 1. Item Tracking
When you track an item with specific criteria, the system stores:
```javascript
{
  weaponName: "AK-47",
  skinName: "Redline",
  minPrice: 5,
  maxPrice: 20,
  wearType: "preset",
  presetWear: "ft",
  stattrak: "any",
  patternNumber: "",
  notes: "Looking for good deal"
}
```

### 2. Automatic Matching
The system:
1. Fetches all available items from Skinport (cached for 5 minutes)
2. Filters items based on your criteria
3. Sorts by price (lowest first)
4. Displays matching listings with prices and links

### 3. Real-time Updates
- Auto-refresh every 5 minutes
- Manual refresh button for immediate updates
- Cache prevents excessive API calls

## API Functions

### Main API Functions (`skinport-api.js`)
```javascript
// Fetch all items
await fetchSkinportItems()

// Search by name
await searchSkinportItems('AK-47 | Redline')

// Find matching listings
await findMatchingListings(trackingCriteria)

// Check all tracked items
await checkAllTrackedItems(trackedItems)

// Set credentials
setSkinportCredentials(clientId, clientSecret)

// Check if configured
hasCredentials()
```

### UI Functions (`skinport-ui.js`)
```javascript
// Display listings for one item
await displayListingsForItem(trackedItem, container)

// Display matches for all tracked items
await displayAllMatches(trackedItems, container)

// Create listing card
createSkinportListingCard(item)

// Create stats widget
createQuickStatsWidget(listings)

// Auto-refresh
startAutoRefresh(callback, intervalMinutes)
stopAutoRefresh()
```

## Usage Examples

### Example 1: Track AK-47 Redline
```javascript
const criteria = {
  weaponName: 'AK-47',
  skinName: 'Redline',
  minPrice: 5,
  maxPrice: 20,
  wearType: 'preset',
  presetWear: 'ft',
  stattrak: 'any'
};

const matches = await findMatchingListings(criteria);
console.log(`Found ${matches.length} matches`);
```

### Example 2: View All Matches on Profile
The profile page automatically:
- Loads all tracked items
- Checks Skinport for matches
- Displays results in organized sections
- Auto-refreshes every 5 minutes

### Example 3: Manual Refresh
```javascript
// Clear cache and refresh
itemsCache = null;
const freshData = await fetchSkinportItems();
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Client Secret is Private**
   - Never commit your Client Secret to version control
   - Don't share your credentials
   - Rotate keys regularly

2. **Production Deployment**
   - For production, use environment variables or server-side configuration
   - Never expose API credentials in client-side code
   - Consider using a backend proxy for API calls

3. **Current Implementation**
   - Credentials are stored in localStorage (client-side)
   - This is suitable for personal/development use
   - For public deployment, implement server-side API calls

## Rate Limits

Skinport API has rate limits:
- **Public endpoints**: ~60 requests/minute
- **Authenticated endpoints**: Higher limits

Our implementation includes:
- 5-minute caching to minimize requests
- Batch operations to check multiple items at once
- Manual refresh option when needed

## Troubleshooting

### No Matches Found
- Expand your price range
- Try "Any" for wear condition
- Check if the item exists on Skinport

### API Errors
- Verify your credentials are correct
- Check your internet connection
- Look at browser console for detailed errors

### Connection Failed
- Double-check Client ID and Client Secret
- Make sure there are no extra spaces
- Verify your Skinport account is active

### Not Updating
- Click the "Refresh" button
- Clear browser cache
- Check that auto-refresh is enabled

See [SKINPORT_SETUP.md](SKINPORT_SETUP.md) for more detailed troubleshooting.

## Future Enhancements

Possible improvements:
1. **Browser Notifications** - Alert when new matches are found
2. **Price History** - Track price changes over time
3. **Price Alerts** - Notify when price drops below threshold
4. **Advanced Filters** - Float value filtering, sticker filtering
5. **Comparison Tool** - Compare prices across multiple marketplaces
6. **Favorites** - Quick access to frequently checked items

## Contributing

To extend the Skinport integration:

1. **Add New Filters**
   - Update `findMatchingListings()` in `skinport-api.js`
   - Add UI controls in tracking modal

2. **Add New UI Components**
   - Create new functions in `skinport-ui.js`
   - Add corresponding styles to `skinport.css`

3. **Add New Features**
   - Follow existing code patterns
   - Maintain caching for performance
   - Handle errors gracefully

## API Reference

### Skinport API Endpoints Used

```
GET /v1/items
- Returns all available items with prices
- Cached for 5 minutes in our implementation
- No authentication required for basic data

GET /v1/sales/history
- Returns sales history
- Requires authentication

GET /v1/account/balance
- Returns account balance
- Requires authentication
```

### Data Structure

Skinport item object:
```javascript
{
  market_hash_name: "AK-47 | Redline (Field-Tested)",
  min_price: 1599,           // Price in cents
  suggested_price: 2000,     // Suggested price in cents
  tradable: true,            // Is item tradable
  currency: "USD"
}
```

## Support

For issues or questions:
1. Check the documentation files
2. Review browser console for errors
3. Verify API credentials
4. Check [Skinport API Documentation](https://skinport.com/api)

## License

This integration is provided as-is for use with the CS2 Skin Tracker application. Please ensure you comply with Skinport's Terms of Service when using their API.

## Credits

- **Skinport API** - For providing the marketplace data
- **CS2 API** - For skin information and images

---

**Happy Trading!** 🎮
