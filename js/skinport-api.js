// ============================================
// CS2 Skin Tracker - Skinport API Integration
// ============================================

const SKINPORT_CONFIG = {
  BASE_URL: 'https://api.skinport.com/v1',
  CORS_PROXY: 'http://localhost:3000/?url=', // Local CORS proxy
  USE_PROXY: true, // Set to false in production
  CLIENT_ID: '', // Add your Skinport Client ID here
  CLIENT_SECRET: '' // Add your Skinport Client Secret here
};

// Cache for API responses to minimize requests
let itemsCache = null;
let itemsCacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ============================================
// API Authentication & Request Helpers
// ============================================

/**
 * Make authenticated request to Skinport API
 */
async function skinportRequest(endpoint, options = {}) {
  let url = `${SKINPORT_CONFIG.BASE_URL}${endpoint}`;

  // Use CORS proxy if enabled (for development)
  if (SKINPORT_CONFIG.USE_PROXY && SKINPORT_CONFIG.CORS_PROXY) {
    url = SKINPORT_CONFIG.CORS_PROXY + encodeURIComponent(url);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Add authentication if credentials are provided
  if (SKINPORT_CONFIG.CLIENT_ID && SKINPORT_CONFIG.CLIENT_SECRET) {
    const auth = btoa(`${SKINPORT_CONFIG.CLIENT_ID}:${SKINPORT_CONFIG.CLIENT_SECRET}`);
    headers['Authorization'] = `Basic ${auth}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`Skinport API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Skinport API request failed:', error);
    throw error;
  }
}

// ============================================
// Public API Functions
// ============================================

/**
 * Fetch all items from Skinport (cached)
 * Returns items with current market prices and availability
 */
async function fetchSkinportItems() {
  const now = Date.now();

  // Return cached data if valid
  if (itemsCache && itemsCacheTimestamp && (now - itemsCacheTimestamp < CACHE_DURATION)) {
    return itemsCache;
  }

  try {
    const data = await skinportRequest('/items', {
      method: 'GET'
    });

    itemsCache = data;
    itemsCacheTimestamp = now;

    return data;
  } catch (error) {
    console.error('Error fetching Skinport items:', error);
    // Return cached data if available, even if expired
    if (itemsCache) {
      console.warn('Using expired cache due to API error');
      return itemsCache;
    }
    throw error;
  }
}

/**
 * Search Skinport items by market hash name
 * @param {string} marketHashName - The market_hash_name from Steam
 * @returns {Array} Array of matching items with prices
 */
async function searchSkinportItems(marketHashName) {
  try {
    const items = await fetchSkinportItems();

    if (!items || !Array.isArray(items)) {
      return [];
    }

    // Find items matching the market hash name
    return items.filter(item =>
      item.market_hash_name &&
      item.market_hash_name.toLowerCase().includes(marketHashName.toLowerCase())
    );
  } catch (error) {
    console.error('Error searching Skinport items:', error);
    return [];
  }
}

/**
 * Find Skinport listings that match tracking criteria
 * @param {Object} trackingCriteria - The tracked item criteria
 * @returns {Array} Array of matching listings
 */
async function findMatchingListings(trackingCriteria) {
  try {
    // Build market hash name from tracking data
    const marketHashName = buildMarketHashName(trackingCriteria);

    // Fetch all items from Skinport
    const allItems = await fetchSkinportItems();

    if (!allItems || !Array.isArray(allItems)) {
      return [];
    }

    // Filter items based on criteria
    let matchingItems = allItems.filter(item => {
      // Match weapon and skin name
      const itemName = item.market_hash_name || '';
      if (!itemNameMatches(itemName, trackingCriteria)) {
        return false;
      }

      // Check StatTrak requirement
      if (trackingCriteria.stattrak === 'required' && !itemName.includes('StatTrak')) {
        return false;
      }
      if (trackingCriteria.stattrak === 'none' && itemName.includes('StatTrak')) {
        return false;
      }

      // Check wear condition
      if (!wearConditionMatches(itemName, trackingCriteria)) {
        return false;
      }

      // Check price range
      if (!priceMatches(item, trackingCriteria)) {
        return false;
      }

      return true;
    });

    // Sort by price (lowest first)
    matchingItems.sort((a, b) => {
      const priceA = a.min_price || a.suggested_price || 0;
      const priceB = b.min_price || b.suggested_price || 0;
      return priceA - priceB;
    });

    // Limit results to prevent overwhelming UI
    return matchingItems.slice(0, 50);

  } catch (error) {
    console.error('Error finding matching listings:', error);
    return [];
  }
}

/**
 * Get sales history for a specific item
 * @param {string} marketHashName - The market_hash_name
 * @returns {Object} Sales history data
 */
async function getSalesHistory(marketHashName) {
  try {
    const data = await skinportRequest(`/sales/history`, {
      method: 'GET'
    });

    // Filter for specific item
    if (data && Array.isArray(data)) {
      return data.filter(sale =>
        sale.market_hash_name === marketHashName
      );
    }

    return [];
  } catch (error) {
    console.error('Error fetching sales history:', error);
    return [];
  }
}

/**
 * Get account balance (requires authentication)
 * @returns {Object} Account balance information
 */
async function getAccountBalance() {
  try {
    return await skinportRequest('/account/balance', {
      method: 'GET'
    });
  } catch (error) {
    console.error('Error fetching account balance:', error);
    throw error;
  }
}

// ============================================
// Helper Functions for Matching
// ============================================

/**
 * Build market hash name from tracking criteria
 */
function buildMarketHashName(criteria) {
  let parts = [];

  if (criteria.stattrak === 'required') {
    parts.push('StatTrak™');
  }

  parts.push(criteria.weaponName);
  parts.push('|');
  parts.push(criteria.skinName);

  // Wear condition will be added when checking

  return parts.join(' ');
}

/**
 * Check if item name matches tracking criteria
 */
function itemNameMatches(itemName, criteria) {
  const weaponName = criteria.weaponName || '';
  const skinName = criteria.skinName || '';

  // Normalize names
  const normalizedItemName = itemName.toLowerCase();
  const normalizedWeapon = weaponName.toLowerCase();
  const normalizedSkin = skinName.toLowerCase();

  return normalizedItemName.includes(normalizedWeapon) &&
         normalizedItemName.includes(normalizedSkin);
}

/**
 * Check if wear condition matches tracking criteria
 */
function wearConditionMatches(itemName, criteria) {
  if (!criteria.wearType || criteria.wearType === 'any') {
    return true;
  }

  if (criteria.wearType === 'preset' && criteria.presetWear) {
    const wearMap = {
      'fn': 'Factory New',
      'mw': 'Minimal Wear',
      'ft': 'Field-Tested',
      'ww': 'Well-Worn',
      'bs': 'Battle-Scarred'
    };

    const requiredWear = wearMap[criteria.presetWear];
    if (requiredWear) {
      return itemName.includes(requiredWear);
    }
  }

  // For custom float ranges, we'd need float values from Skinport API
  // This is a simplified check
  if (criteria.wearType === 'custom') {
    // Note: Skinport API doesn't always provide float values in the items endpoint
    // You may need to use a different endpoint or service for float-specific filtering
    return true; // Accept all for now, can be refined
  }

  return true;
}

/**
 * Check if price matches criteria
 */
function priceMatches(item, criteria) {
  const price = item.min_price || item.suggested_price;

  if (!price) {
    return true; // Include items without price data
  }

  // Convert to dollars (Skinport prices are in cents)
  const priceInDollars = price / 100;

  if (criteria.minPrice && priceInDollars < criteria.minPrice) {
    return false;
  }

  if (criteria.maxPrice && priceInDollars > criteria.maxPrice) {
    return false;
  }

  return true;
}

/**
 * Format price from Skinport API (cents to dollars)
 */
function formatPrice(priceInCents) {
  if (!priceInCents) return 'N/A';
  return `$${(priceInCents / 100).toFixed(2)}`;
}

/**
 * Get item URL on Skinport
 */
function getSkinportItemUrl(marketHashName) {
  const encoded = encodeURIComponent(marketHashName);
  return `https://skinport.com/item/${encoded}`;
}

/**
 * Calculate discount percentage
 */
function calculateDiscount(currentPrice, suggestedPrice) {
  if (!currentPrice || !suggestedPrice || suggestedPrice === 0) {
    return 0;
  }

  const discount = ((suggestedPrice - currentPrice) / suggestedPrice) * 100;
  return Math.round(discount);
}

// ============================================
// Batch Processing for Multiple Tracked Items
// ============================================

/**
 * Check all tracked items for matches
 * @param {Array} trackedItems - Array of tracked items
 * @returns {Object} Map of item IDs to their matching listings
 */
async function checkAllTrackedItems(trackedItems) {
  const results = {};

  try {
    // Fetch all Skinport items once
    await fetchSkinportItems();

    // Check each tracked item
    for (const item of trackedItems) {
      if (item.status !== 'tracking') {
        continue; // Skip non-active items
      }

      const matches = await findMatchingListings(item);
      if (matches.length > 0) {
        results[item.skinId] = matches;
      }
    }

    return results;
  } catch (error) {
    console.error('Error checking tracked items:', error);
    return {};
  }
}

// ============================================
// Configuration Management
// ============================================

/**
 * Set Skinport API credentials
 */
function setSkinportCredentials(clientId, clientSecret) {
  SKINPORT_CONFIG.CLIENT_ID = clientId;
  SKINPORT_CONFIG.CLIENT_SECRET = clientSecret;

  // Save to localStorage for persistence
  localStorage.setItem('skinport_client_id', clientId);
  localStorage.setItem('skinport_client_secret', clientSecret);
}

/**
 * Load Skinport credentials from localStorage
 */
function loadSkinportCredentials() {
  const clientId = localStorage.getItem('skinport_client_id');
  const clientSecret = localStorage.getItem('skinport_client_secret');

  if (clientId) SKINPORT_CONFIG.CLIENT_ID = clientId;
  if (clientSecret) SKINPORT_CONFIG.CLIENT_SECRET = clientSecret;
}

/**
 * Check if API credentials are configured
 */
function hasCredentials() {
  return Boolean(SKINPORT_CONFIG.CLIENT_ID && SKINPORT_CONFIG.CLIENT_SECRET);
}

// Initialize credentials on load
loadSkinportCredentials();
