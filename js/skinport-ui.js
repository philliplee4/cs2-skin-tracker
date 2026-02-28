// ============================================
// CS2 Skin Tracker - Skinport UI Components
// ============================================
// Note: Requires skinport-api.js to be loaded first

// ============================================
// Create Listing Card
// ============================================

/**
 * Create a listing card for a Skinport item
 * @param {Object} item - Skinport item data
 * @returns {HTMLElement} The listing card element
 */
function createSkinportListingCard(item) {
  const card = document.createElement('div');
  card.className = 'skinport-listing-card';

  const price = item.min_price || item.suggested_price || 0;
  const suggestedPrice = item.suggested_price || 0;
  const priceFormatted = formatPrice(price);
  const suggestedPriceFormatted = formatPrice(suggestedPrice);

  // Calculate discount
  const discount = calculateDiscount(price, suggestedPrice);
  const hasDiscount = discount > 0;

  // Extract wear from name
  const wear = extractWear(item.market_hash_name);

  // Item URL
  const itemUrl = item.item_page || item.market_page || getSkinportItemUrl(item.market_hash_name);


  card.innerHTML = `
    <div class="listing-header">
      <h4 class="listing-name">${item.market_hash_name}</h4>
      ${hasDiscount ? `<span class="discount-badge">-${discount}%</span>` : ''}
    </div>

    <div class="listing-info">
      ${wear ? `<span class="wear-badge">${wear}</span>` : ''}
      ${item.tradable !== undefined ? `
        <span class="tradable-badge ${item.tradable ? 'tradable' : 'not-tradable'}">
          ${item.tradable ? 'Tradable' : 'Not Tradable'}
        </span>
      ` : ''}
    </div>

    <div class="listing-price">
      <div class="current-price">
        <span class="price-label">Current Price:</span>
        <span class="price-value">${priceFormatted}</span>
      </div>
      ${suggestedPrice && suggestedPrice !== price ? `
        <div class="suggested-price">
          <span class="price-label">Suggested:</span>
          <span class="price-value strikethrough">${suggestedPriceFormatted}</span>
        </div>
      ` : ''}
    </div>

    <div class="listing-actions">
      <a href="${itemUrl}" target="_blank" rel="noopener noreferrer" class="btn-view-skinport">
        View on Skinport
      </a>
    </div>
  `;

  return card;
}

/**
 * Extract wear condition from market hash name
 */
function extractWear(marketHashName) {
  const wearConditions = [
    'Factory New',
    'Minimal Wear',
    'Field-Tested',
    'Well-Worn',
    'Battle-Scarred'
  ];

  for (const wear of wearConditions) {
    if (marketHashName.includes(wear)) {
      return wear;
    }
  }

  return null;
}

// ============================================
// Display Listings Container
// ============================================

/**
 * Create and display listings for a tracked item
 * @param {Object} trackedItem - The tracked item
 * @param {HTMLElement} container - Container element to render into
 */
async function displayListingsForItem(trackedItem, container) {
  // Show loading state
  container.innerHTML = '<div class="listings-loading">Searching for matching items on Skinport...</div>';

  try {
    // Find matching listings
    const listings = await findMatchingListings(trackedItem);

    if (listings.length === 0) {
      container.innerHTML = `
        <div class="listings-empty">
          <p>No matching items found on Skinport at this time.</p>
          <p class="help-text">Try adjusting your tracking criteria or check back later.</p>
        </div>
      `;
      return;
    }

    // Clear loading state
    container.innerHTML = '';

    // Add header
    const header = document.createElement('div');
    header.className = 'listings-header';
    header.innerHTML = `
      <h3>Available on Skinport (${listings.length} items)</h3>
      <p class="listings-subtitle">Sorted by price (lowest first)</p>
    `;
    container.appendChild(header);

    // Add listings grid
    const grid = document.createElement('div');
    grid.className = 'listings-grid';

    listings.forEach(item => {
      const card = createSkinportListingCard(item);
      grid.appendChild(card);
    });

    container.appendChild(grid);

  } catch (error) {
    console.error('Error displaying listings:', error);
    container.innerHTML = `
      <div class="listings-error">
        <p>Failed to load Skinport listings.</p>
        <p class="help-text">Please check your API credentials and try again.</p>
      </div>
    `;
  }
}

/**
 * Display matches for all tracked items (dashboard view)
 * @param {Array} trackedItems - Array of tracked items
 * @param {HTMLElement} container - Container element
 */
async function getAndDisplayMatches(trackedItems, container) {
  container.innerHTML = '<div class="matches-loading">Checking for matches on Skinport...</div>';

  try {
    const matchResults = await checkAllTrackedItems(trackedItems);

    const matchCount = Object.keys(matchResults).length;

    if (matchCount === 0) {
      container.innerHTML = `
        <div class="matches-empty">
          <h3>No Matches Found</h3>
          <p>No items matching your tracking criteria are currently available on Skinport.</p>
        </div>
      `;
      return matchResults;
    }

    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'matches-header';
    header.innerHTML = `
      <h2>Found Matches (${matchCount} tracked items)</h2>
      <p>Click on a listing to view it on Skinport</p>
    `;
    container.appendChild(header);

    // Create sections for each tracked item with matches
    for (const [skinId, listings] of Object.entries(matchResults)) {
      const trackedItem = trackedItems.find(item => item.skinId === skinId);
      if (!trackedItem) continue;

      const section = document.createElement('div');
      section.className = 'match-section';

      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'match-section-header';
      sectionHeader.innerHTML = `
        <img src="${trackedItem.image}" alt="${trackedItem.skinName}" class="match-item-image">
        <div class="match-item-info">
          <h3>${trackedItem.weaponName} | ${trackedItem.skinName}</h3>
          <p>${listings.length} matching ${listings.length === 1 ? 'listing' : 'listings'}</p>
        </div>
      `;
      section.appendChild(sectionHeader);

      // Listings grid (show top 5 for dashboard)
      const grid = document.createElement('div');
      grid.className = 'listings-grid compact';

      listings.slice(0, 5).forEach(item => {
        const card = createSkinportListingCard(item);
        grid.appendChild(card);
      });

      section.appendChild(grid);

      if (listings.length > 5) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'btn-view-more';
        moreBtn.textContent = `View all ${listings.length} listings`;
        moreBtn.addEventListener('click', () => {
          window.location.href = `item.html?id=${skinId}`;
        });
        section.appendChild(moreBtn);
      }

      container.appendChild(section);
    }
    return matchResults;
  } catch (error) {
    console.error('Error displaying matches:', error);
    container.innerHTML = `
      <div class="matches-error">
        <h3>Error Loading Matches</h3>
        <p>Failed to check Skinport for matches. Please try again later.</p>
      </div>
    `;
    return null;
  }
}

// ============================================
// Settings/Configuration UI
// ============================================

/**
 * Create Skinport API settings form
 * @returns {HTMLElement} Settings form element
 */
function createSkinportSettingsForm() {
  const form = document.createElement('div');
  form.className = 'skinport-settings';

  const hasAuth = hasCredentials();

  form.innerHTML = `
    <div class="settings-header">
      <h3>Skinport API Configuration</h3>
      ${hasAuth ? `
        <span class="status-badge status-connected">Connected</span>
      ` : `
        <span class="status-badge status-not-connected">Not Connected</span>
      `}
    </div>

    <p class="settings-description">
      To enable real-time price tracking and listing matching, you need to configure your Skinport API credentials.
      <a href="https://skinport.com/api" target="_blank" rel="noopener noreferrer">Get your API key</a>
    </p>

    <form id="skinportCredentialsForm">
      <div class="form-group">
        <label for="skinportClientId">Client ID</label>
        <input
          type="text"
          id="skinportClientId"
          placeholder="Enter your Skinport Client ID"
          value="${SKINPORT_CONFIG.CLIENT_ID || ''}"
        />
      </div>

      <div class="form-group">
        <label for="skinportClientSecret">Client Secret</label>
        <input
          type="password"
          id="skinportClientSecret"
          placeholder="Enter your Skinport Client Secret"
          value="${SKINPORT_CONFIG.CLIENT_SECRET || ''}"
        />
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">Save Credentials</button>
        <button type="button" class="btn-secondary" id="testSkinportConnection">Test Connection</button>
      </div>
    </form>

    <div id="settingsMessage" class="settings-message hidden"></div>
  `;

  return form;
}

/**
 * Setup settings form event listeners
 */
function setupSkinportSettingsListeners() {
  const form = document.getElementById('skinportCredentialsForm');
  const testBtn = document.getElementById('testSkinportConnection');
  const messageDiv = document.getElementById('settingsMessage');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const clientId = document.getElementById('skinportClientId').value.trim();
      const clientSecret = document.getElementById('skinportClientSecret').value.trim();

      if (!clientId || !clientSecret) {
        showSettingsMessage('Please enter both Client ID and Client Secret', 'error');
        return;
      }

      setSkinportCredentials(clientId, clientSecret);
      showSettingsMessage('Credentials saved successfully!', 'success');

      // Update status badge
      const badge = document.querySelector('.status-badge');
      if (badge) {
        badge.textContent = 'Connected';
        badge.className = 'status-badge status-connected';
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';

      try {
        // Try to fetch items to test connection
        await fetchSkinportItems();
        showSettingsMessage('Connection successful! API is working.', 'success');
      } catch (error) {
        showSettingsMessage('Connection failed. Please check your credentials.', 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
      }
    });
  }

  function showSettingsMessage(message, type) {
    if (!messageDiv) return;

    messageDiv.textContent = message;
    messageDiv.className = `settings-message ${type}`;
    messageDiv.classList.remove('hidden');

    setTimeout(() => {
      messageDiv.classList.add('hidden');
    }, 5000);
  }
}

// ============================================
// Quick Stats Display
// ============================================

/**
 * Create a stats widget showing cheapest matches
 * @param {Array} listings - Array of Skinport listings
 * @returns {HTMLElement} Stats widget
 */
function createQuickStatsWidget(listings) {
  const widget = document.createElement('div');
  widget.className = 'skinport-stats-widget';

  if (!listings || listings.length === 0) {
    widget.innerHTML = '<p class="no-data">No data available</p>';
    return widget;
  }

  const prices = listings.map(item => item.min_price || item.suggested_price || 0);
  const cheapest = Math.min(...prices);
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  const mostExpensive = Math.max(...prices);

  widget.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-label">Cheapest</span>
        <span class="stat-value">${formatPrice(cheapest)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Average</span>
        <span class="stat-value">${formatPrice(average)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Most Expensive</span>
        <span class="stat-value">${formatPrice(mostExpensive)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Total Listings</span>
        <span class="stat-value">${listings.length}</span>
      </div>
    </div>
  `;

  return widget;
}

// ============================================
// Auto-refresh functionality
// ============================================

let refreshInterval = null;

/**
 * Start auto-refreshing listings
 * @param {Function} refreshCallback - Function to call on refresh
 * @param {number} intervalMinutes - Refresh interval in minutes (default: 5)
 */
function startAutoRefresh(refreshCallback, intervalMinutes = 5) {
  // Clear existing interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // Set new interval
  refreshInterval = setInterval(() => {
    console.log('Auto-refreshing Skinport data...');
    refreshCallback();
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop auto-refreshing
 */
function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
