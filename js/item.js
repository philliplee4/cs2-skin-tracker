// ============================================
// CS2 Skin Tracker - Item Detail Page
// ============================================
// Note: Requires api.js to be loaded first

let currentSkin = null;

// ============================================
// Get Item ID from URL
// ============================================

function getItemIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// ============================================
// Load and Display Item Details
// ============================================

async function loadItemDetails() {
  const itemId = getItemIdFromURL();

  if (!itemId) {
    document.querySelector('.item-detail').innerHTML = `
      <div class="error-message">
        <h2>Item not found</h2>
        <p>No item ID specified in the URL.</p>
        <a href="index.html" class="btn-primary">← Back to Home</a>
      </div>
    `;
    return;
  }

  try {
    // Fetch the skin data
    currentSkin = await getSkinById(itemId);

    if (!currentSkin) {
      throw new Error('Skin not found');
    }

    // Display the item details
    displayItemDetails(currentSkin);

    // Load market prices + price history graph (non-blocking — both fire in background)
    loadMarketPrices(currentSkin).catch(err => console.warn('Market prices error:', err));
    loadPriceHistory(currentSkin).catch(err => console.warn('Price history error:', err));

    // Load related skins
    await loadRelatedSkins(currentSkin);

  } catch (error) {
    console.error('Error loading item:', error);
    document.querySelector('.item-detail').innerHTML = `
      <div class="error-message">
        <h2>Failed to load item</h2>
        <p>Could not load the item details. Please try again later.</p>
        <a href="index.html" class="btn-primary">← Back to Home</a>
      </div>
    `;
  }
}

// ============================================
// Display Item Details
// ============================================

function displayItemDetails(skin) {
  // Update page title
  const weaponName = skin.weapon?.name || 'Unknown';
  const skinName = skin.pattern?.name || skin.name || 'Unknown';
  document.title = `${weaponName} | ${skinName} - CS2 Skin Tracker`;

  // Image
  const itemImage = document.getElementById('itemImage');
  itemImage.src = skin.image || '';
  itemImage.alt = `${weaponName} ${skinName}`;

  // Weapon Type
  document.getElementById('weaponType').textContent = weaponName;

  // Skin Name
  document.getElementById('skinName').textContent = skinName;

  // Rarity Badge
  const rarityName = skin.rarity?.name || 'Consumer Grade';
  const rarityClass = getRarityClass(rarityName);
  const categoryName = skin.category?.name || '';
  const rarityText = `${rarityName} ${categoryName}`.trim();

  const rarityBadge = document.getElementById('itemRarity');
  rarityBadge.textContent = rarityText;
  rarityBadge.className = `rarity ${rarityClass}`;

  // StatTrak Badge
  const stattrakBadge = document.getElementById('itemStattrak');
  if (skin.stattrak) {
    stattrakBadge.classList.remove('hidden');
    stattrakBadge.textContent = 'StatTrak Available';
  } else {
    stattrakBadge.classList.add('hidden');
  }

  // Category
  const category = getCategoryFromSkin(skin);
  document.getElementById('itemCategory').textContent = getCategoryDisplayName(category);

  // Collection
  const collectionRow = document.getElementById('collectionRow');
  if (skin.collections && skin.collections.length > 0) {
    const collectionNames = skin.collections.map(c => c.name).join(', ');
    document.getElementById('itemCollection').textContent = collectionNames;
    collectionRow.style.display = 'flex';
  } else {
    collectionRow.style.display = 'none';
  }

  // Wear Range
  const wearRangeRow = document.getElementById('wearRangeRow');
  if (skin.min_float !== undefined && skin.max_float !== undefined) {
    document.getElementById('itemWearRange').textContent =
      `${skin.min_float.toFixed(2)} - ${skin.max_float.toFixed(2)}`;
    wearRangeRow.style.display = 'flex';
  } else {
    wearRangeRow.style.display = 'none';
  }

  // Description
  const descriptionRow = document.getElementById('descriptionRow');
  if (skin.description) {
    document.getElementById('itemDescription').textContent = skin.description;
    descriptionRow.style.display = 'flex';
  } else {
    descriptionRow.style.display = 'none';
  }
}

// ============================================
// Load Related Skins
// ============================================

async function loadRelatedSkins(currentSkin) {
  const weaponName = currentSkin.weapon?.name;

  if (!weaponName) return;

  try {
    // Get all skins for the same weapon
    const relatedSkins = await getSkinsByWeapon(weaponName);

    // Filter out the current skin and limit to 8 results
    const filteredSkins = relatedSkins
      .filter(skin => skin.id !== currentSkin.id)
      .slice(0, 8);

    // Update section title
    document.getElementById('relatedWeaponName').textContent = weaponName;

    // Render related skins
    const grid = document.getElementById('relatedSkinsGrid');

    if (filteredSkins.length === 0) {
      grid.innerHTML = '<p class="no-results">No other skins available for this weapon.</p>';
      return;
    }

    grid.innerHTML = '';

    filteredSkins.forEach(skin => {
      const card = createSkinCard(skin);
      grid.appendChild(card);
    });

  } catch (error) {
    console.error('Error loading related skins:', error);
  }
}

// ============================================
// Create Skin Card
// ============================================

function createSkinCard(skin) {
  const card = document.createElement('div');
  card.className = 'card';

  // Get rarity class
  const rarityName = skin.rarity?.name || 'Consumer Grade';
  const rarityClass = getRarityClass(rarityName);

  // Weapon type
  const weaponType = skin.weapon?.name || 'Unknown';

  // Skin name
  const skinName = skin.pattern?.name || skin.name || 'Unknown';

  // Rarity display text
  const categoryName = skin.category?.name || '';
  const rarityText = `${rarityName} ${categoryName}`.trim();

  // StatTrak
  const hasStattrak = skin.stattrak || false;

  // Image URL
  const imageUrl = skin.image || '';

  card.innerHTML = `
    <p class="weapon-type">${weaponType}</p>
    <h3 class="skin-name">${skinName}</h3>
    <span class="rarity ${rarityClass}">${rarityText}</span>
    ${hasStattrak ? '<span class="stattrak">StatTrak Available</span>' : ''}
    <img src="${imageUrl}" alt="${weaponType} ${skinName}" loading="lazy">
  `;

  // Click handler - navigate to item page
  card.addEventListener('click', () => {
    window.location.href = `item.html?id=${skin.id}`;
  });

  return card;
}

// ============================================
// Tracking Modal
// ============================================

function openTrackingModal() {
  if (!currentSkin) return;

  const modal = document.getElementById('trackingModal');
  const weaponName = currentSkin.weapon?.name || 'Unknown';
  const skinName = currentSkin.pattern?.name || currentSkin.name || 'Unknown';

  // Populate modal with item info
  document.getElementById('modalItemImage').src = currentSkin.image || '';
  document.getElementById('modalWeaponType').textContent = weaponName;
  document.getElementById('modalSkinName').textContent = skinName;

  // Hide StatTrak section if item doesn't support it
  const stattrakSection = document.getElementById('stattrakSection');
  if (!currentSkin.stattrak) {
    stattrakSection.style.display = 'none';
  } else {
    stattrakSection.style.display = 'block';
  }

  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeTrackingModal() {
  const modal = document.getElementById('trackingModal');
  modal.classList.add('hidden');
  document.body.style.overflow = ''; // Restore scrolling

  // Reset form
  document.getElementById('trackingForm').reset();
  document.querySelectorAll('.conditional-section').forEach(section => {
    section.classList.add('hidden');
  });
}

function setupModalEventListeners() {
  const trackBtn = document.getElementById('trackItemBtn');
  const closeBtn = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelTrack');
  const overlay = document.querySelector('.modal-overlay');
  const form = document.getElementById('trackingForm');

  // Open modal
  if (trackBtn) {
    trackBtn.addEventListener('click', openTrackingModal);
  }

  // Close modal
  if (closeBtn) {
    closeBtn.addEventListener('click', closeTrackingModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeTrackingModal);
  }
  if (overlay) {
    overlay.addEventListener('click', closeTrackingModal);
  }

  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('trackingModal');
      if (!modal.classList.contains('hidden')) {
        closeTrackingModal();
      }
    }
  });

  // Handle wear type radio changes
  const wearTypeRadios = document.querySelectorAll('input[name="wearType"]');
  wearTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const presetSection = document.getElementById('presetWearSection');
      const customSection = document.getElementById('customWearSection');

      // Hide all conditional sections
      presetSection.classList.add('hidden');
      customSection.classList.add('hidden');

      // Show relevant section
      if (e.target.value === 'preset') {
        presetSection.classList.remove('hidden');
      } else if (e.target.value === 'custom') {
        customSection.classList.remove('hidden');
      }
    });
  });

  // Handle form submission
  if (form) {
    form.addEventListener('submit', handleTrackingSubmit);
  }
}

async function handleTrackingSubmit(e) {
  e.preventDefault();

  if (!currentSkin) return;

  const formData = new FormData(e.target);

  const trackingData = {
    id: currentSkin.id,
    skinId: currentSkin.id,
    weaponName: currentSkin.weapon?.name || 'Unknown',
    skinName: currentSkin.pattern?.name || currentSkin.name || 'Unknown',
    image: currentSkin.image,
    rarity: currentSkin.rarity?.name,
    category: currentSkin.category?.name,
    dateAdded: new Date().toISOString(),
    minPrice: formData.get('minPrice') ? parseFloat(formData.get('minPrice')) : null,
    maxPrice: formData.get('maxPrice') ? parseFloat(formData.get('maxPrice')) : null,
    wearType: formData.get('wearType'),
    presetWear: formData.get('presetWear'),
    minFloat: formData.get('minFloat') ? parseFloat(formData.get('minFloat')) : null,
    maxFloat: formData.get('maxFloat') ? parseFloat(formData.get('maxFloat')) : null,
    stattrak: formData.get('stattrak'),
    souvenir: formData.get('souvenir'),
    patternNumber: formData.get('patternNumber'),
    finishCatalog: formData.get('finishCatalog') || formData.get('finishCatalogCustom') || null,
    notes: formData.get('notes')
  };

  await saveTrackedItem(trackingData);
}

async function saveTrackedItem(trackingData) {
  try {
    // Save to API
    await apiRequest('/tracked', {
      method: 'POST',
      body: JSON.stringify({
        skin_id: trackingData.skinId,
        weapon_name: trackingData.weaponName,
        skin_name: trackingData.skinName,
        image_url: trackingData.image,
        rarity: trackingData.rarity,
        category: trackingData.category,
        min_price: trackingData.minPrice,
        max_price: trackingData.maxPrice,
        wear_type: trackingData.wearType,
        preset_wear: trackingData.presetWear,
        min_float: trackingData.minFloat,
        max_float: trackingData.maxFloat,
        stattrak: trackingData.stattrak,
        souvenir: trackingData.souvenir,
        pattern_number: trackingData.patternNumber,
        finish_catalog: trackingData.finishCatalog,
        notes: trackingData.notes
      })
    });

    showSuccessToast();
    closeTrackingModal();
  } catch (error) {
    console.error('Error saving tracked item:', error);

    // Show appropriate error message
    if (error.message.includes('already tracking')) {
      showErrorToast('You are already tracking this item with the same criteria');
    } else if (error.message.includes('Not logged in')) {
      showErrorToast('Please log in to track items');
      setTimeout(() => { window.location.href = 'login.html'; }, 2000);
    } else {
      showErrorToast('Failed to save tracked item. Please try again.');
    }
  }
}

function showSuccessToast() {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <span>✓ Item added to tracking list!</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showErrorToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification toast-error';
  toast.innerHTML = `
    <span>✗ ${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// Market Price Comparison
// ============================================

// Module-level chart instance so we can destroy + recreate cleanly on nav
let _priceChart = null;

/**
 * Fetch multi-market spot prices and render them into the compact price pills.
 * Called after loadItemDetails() resolves so we have weapon/skin names.
 */
async function loadMarketPrices(skin) {
  const weaponName = skin.weapon?.name;
  const skinName   = skin.pattern?.name || skin.name;

  if (!weaponName || !skinName) {
    const section = document.querySelector('.market-prices-section');
    if (section) section.style.display = 'none';
    return;
  }

  try {
    const params = new URLSearchParams({ weapon: weaponName, skin: skinName });
    const data   = await apiRequest(`/market-prices?${params}`);
    renderMarketPrices(data);
  } catch (err) {
    console.warn('Market price fetch failed:', err.message);
    renderMarketPricesError();
  }
}

/**
 * Fetch price history and render the Chart.js graph.
 * Uses Skinport history; falls back to Steam spot price if unavailable.
 */
async function loadPriceHistory(skin) {
  const weaponName = skin.weapon?.name;
  const skinName   = skin.pattern?.name || skin.name;

  if (!weaponName || !skinName) return;

  try {
    const params = new URLSearchParams({ weapon: weaponName, skin: skinName });
    const data   = await apiRequest(`/price-history?${params}`);

    if (data.rateLimited) {
      const overlay = document.getElementById('mpChartLoading');
      if (overlay) overlay.innerHTML = '<span class="mp-chart-loading-text">Price history temporarily unavailable — try again in a moment</span>';
      return;
    }

    renderPriceChart(data.history);
  } catch (err) {
    console.warn('Price history fetch failed:', err.message);
    const overlay = document.getElementById('mpChartLoading');
    if (overlay) overlay.innerHTML = '<span class="mp-chart-loading-text">Price history unavailable</span>';
  }
}

/**
 * Draw the price history chart using Chart.js.
 * Supports Skinport multi-point history and Steam single-point fallback.
 * @param {Object|null} history  - { wear, source?, points: [{label, min, median, volume}] }
 */
function renderPriceChart(history) {
  const canvas    = document.getElementById('priceHistoryChart');
  const overlay   = document.getElementById('mpChartLoading');
  const wearBadge = document.getElementById('mpWearBadge');
  const subtitle  = document.getElementById('mpSubtitle');

  if (!canvas) return;

  if (!history || !Array.isArray(history.points) || history.points.length === 0) {
    if (overlay) overlay.innerHTML = '<span class="mp-chart-loading-text">No price history available</span>';
    return;
  }

  // Hide the loading overlay
  if (overlay) overlay.style.display = 'none';

  // Wear badge
  if (wearBadge && history.wear) {
    wearBadge.textContent = history.wear;
    wearBadge.style.display = 'inline-block';
  }

  // Subtitle — note if this is a Steam fallback
  const isSteamFallback = history.source === 'steam';
  if (subtitle) subtitle.textContent = isSteamFallback
    ? 'Steam current price · Skinport history unavailable'
    : 'Skinport price history · all listings · Skinport data';

  const labels     = history.points.map(p => p.label);
  const medianData = history.points.map(p => p.median);
  const minData    = history.points.map(p => p.min);

  // Destroy previous chart if navigating between skins
  if (_priceChart) {
    _priceChart.destroy();
    _priceChart = null;
  }

  const ctx = canvas.getContext('2d');

  // Teal gradient fill under the median line
  // Use the canvas's CSS height as fallback; offsetHeight can be 0 before layout
  const chartHeight = canvas.offsetHeight || canvas.parentElement?.offsetHeight || 220;
  const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradient.addColorStop(0, 'rgba(58, 242, 255, 0.22)');
  gradient.addColorStop(1, 'rgba(58, 242, 255, 0.01)');

  _priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Median',
          data: medianData,
          borderColor: '#3af2ff',
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointBackgroundColor: '#3af2ff',
          pointBorderColor: '#0f1115',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.35,
          spanGaps: true
        },
        {
          label: 'Min',
          data: minData,
          borderColor: 'rgba(255, 255, 255, 0.28)',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointBackgroundColor: 'rgba(255, 255, 255, 0.45)',
          pointBorderColor: '#0f1115',
          pointBorderWidth: 1,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.35,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1c22',
          borderColor: '#3a3c43',
          borderWidth: 1,
          titleColor: '#888',
          titleFont: { size: 11 },
          bodyColor: '#e0e0e0',
          bodyFont: { size: 13 },
          padding: 12,
          displayColors: true,
          callbacks: {
            title: (items) => items[0]?.label ?? '',
            label: (ctx) => {
              const v = ctx.raw;
              return `  ${ctx.dataset.label}:  ${v != null ? '$' + v.toFixed(2) : 'N/A'}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid:   { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks:  { color: '#666', font: { size: 12 }, padding: 6 },
          border: { color: '#2a2c33' }
        },
        y: {
          grid:   { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks:  {
            color: '#666',
            font:  { size: 12 },
            padding: 8,
            callback: (v) => v != null ? '$' + v.toFixed(2) : ''
          },
          border: { color: '#2a2c33' }
        }
      }
    }
  });
}

/**
 * Render current market spot prices into the compact price pills.
 * Marks the cheapest source with an accent border + badge.
 */
function renderMarketPrices(data) {
  const sources = [
    { key: 'skinport', pillId: 'mpsPill-skinport', priceId: 'mpsPrice-skinport', linkId: 'mpsLink-skinport' },
    { key: 'dmarket',  pillId: 'mpsPill-dmarket',  priceId: 'mpsPrice-dmarket',  linkId: 'mpsLink-dmarket'  },
    { key: 'steam',    pillId: 'mpsPill-steam',     priceId: 'mpsPrice-steam',    linkId: 'mpsLink-steam'    }
  ];

  const validPrices = [];

  sources.forEach(({ key, pillId, priceId, linkId }) => {
    const pill    = document.getElementById(pillId);
    const priceEl = document.getElementById(priceId);
    const linkEl  = document.getElementById(linkId);
    const source  = data[key];

    if (!pill || !priceEl) return;

    if (source && source.price != null && source.price > 0) {
      const formatted = '$' + source.price.toFixed(2);
      let sub = '';
      if (key === 'steam') {
        sub = '<span class="mps-sub">Field-Tested · incl. fee</span>';
      } else if (source.count != null) {
        sub = `<span class="mps-sub">${source.count} listing${source.count !== 1 ? 's' : ''}</span>`;
      }
      priceEl.innerHTML = `<span class="mps-price-value">${formatted}</span>${sub}`;

      if (linkEl && source.url) linkEl.href = source.url;

      validPrices.push({ key, price: source.price, pillId, priceId });
    } else {
      priceEl.innerHTML = '<span class="mps-unavailable">—</span>';
      pill.classList.add('mps-pill-unavailable');
      if (linkEl) linkEl.style.display = 'none';
    }
  });

  // Highlight cheapest
  if (validPrices.length > 1) {
    const cheapest = validPrices.reduce((a, b) => a.price <= b.price ? a : b);
    const pill = document.getElementById(cheapest.pillId);
    if (pill) {
      pill.classList.add('mps-pill-cheapest');
      const priceEl = document.getElementById(cheapest.priceId);
      if (priceEl) {
        const badge = document.createElement('span');
        badge.className = 'mps-cheapest-badge';
        badge.textContent = 'Cheapest';
        priceEl.appendChild(badge);
      }
    }
  }
}

/** Render error state in all price pills. */
function renderMarketPricesError() {
  ['mpsPrice-skinport', 'mpsPrice-dmarket', 'mpsPrice-steam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="mps-unavailable">—</span>';
  });
  ['mpsLink-skinport', 'mpsLink-dmarket', 'mpsLink-steam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  loadItemDetails();
  setupModalEventListeners();
});