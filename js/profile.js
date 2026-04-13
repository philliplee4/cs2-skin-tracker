// ============================================
// CS2 Skin Tracker - Profile/Dashboard Page
// ============================================

let trackedItems = [];
let currentFilter = 'all';
let editingItemId = null;

// ============================================
// Load and Display Tracked Items
// ============================================

async function loadTrackedItems() {
  try {
    const data = await apiRequest('/tracked');

    // Map database columns to the format the frontend expects
    trackedItems = data.map(item => ({
      id: item.id,
      skinId: item.skin_id,
      weaponName: item.weapon_name,
      skinName: item.skin_name,
      image: item.image_url,
      rarity: item.rarity,
      category: item.category,
      minPrice: item.min_price ? parseFloat(item.min_price) : null,
      maxPrice: item.max_price ? parseFloat(item.max_price) : null,
      wearType: item.wear_type,
      presetWear: item.preset_wear,
      minFloat: item.min_float ? parseFloat(item.min_float) : null,
      maxFloat: item.max_float ? parseFloat(item.max_float) : null,
      stattrak: item.stattrak,
      souvenir: item.souvenir,
      patternNumber: item.pattern_number,
      finishCatalog: item.finish_catalog,
      notes: item.notes,
      status: item.status,
      dateAdded: item.created_at
    }));

    updateStats();
    renderTrackedItems();
  } catch (error) {
    console.error('Error loading tracked items:', error);
    trackedItems = [];
    updateStats();
    renderTrackedItems();
  }
}

function updateStats() {
  const total = trackedItems.length;
  const found = trackedItems.filter(item => item.status === 'found').length;
  const tracking = trackedItems.filter(item => item.status === 'tracking').length;
  const cancelled = trackedItems.filter(item => item.status === 'cancelled').length;

  document.getElementById('totalTracked').textContent = total;
  document.getElementById('totalFound').textContent = found;
  document.getElementById('totalTracking').textContent = tracking;
  document.getElementById('totalCancelled').textContent = cancelled;
}

function renderTrackedItems() {
  const container = document.getElementById('trackedItemsContainer');
  const emptyState = document.getElementById('emptyState');

  let filteredItems = trackedItems;
  if (currentFilter !== 'all') {
    filteredItems = trackedItems.filter(item => item.status === currentFilter);
  }

  if (filteredItems.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  filteredItems.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  container.innerHTML = filteredItems.map(item => createTrackedItemCard(item)).join('');
  setupCardEventListeners();
}

function createTrackedItemCard(item) {
  const statusClass = `status-${item.status}`;
  const statusText = {
    'tracking': '🟡 Tracking',
    'found': '🟢 Found',
    'cancelled': '🔴 Cancelled'
  }[item.status] || '🟡 Tracking';

  const priceRange = getPriceRangeText(item);
  const wearCondition = getWearConditionText(item);
  const stattrakText = getStattrakText(item);
  const souvenirText = getSouvenirText(item);
  const dateAdded = new Date(item.dateAdded).toLocaleDateString();

  return `
    <div class="tracked-item-card" data-item-id="${item.skinId}">
      <div class="tracked-item-header">
        <img src="${item.image}" alt="${item.skinName}" class="tracked-item-image">
        <span class="tracked-item-status ${statusClass}">${statusText}</span>
      </div>

      <div class="tracked-item-details">
        <p class="tracked-item-weapon">${item.weaponName}</p>
        <h3 class="tracked-item-name">${item.skinName}</h3>

        <div class="tracked-item-info">
          ${priceRange ? `
            <div class="info-item">
              <span class="info-label">Price Range</span>
              <span class="info-value">${priceRange}</span>
            </div>
          ` : ''}

          ${wearCondition ? `
            <div class="info-item">
              <span class="info-label">Wear</span>
              <span class="info-value">${wearCondition}</span>
            </div>
          ` : ''}

          ${stattrakText ? `
            <div class="info-item">
              <span class="info-label">StatTrak</span>
              <span class="info-value">${stattrakText}</span>
            </div>
          ` : ''}

          ${souvenirText ? `
            <div class="info-item">
              <span class="info-label">Souvenir</span>
              <span class="info-value">${souvenirText}</span>
            </div>
          ` : ''}

          ${item.patternNumber ? `
            <div class="info-item">
              <span class="info-label">Pattern</span>
              <span class="info-value">#${item.patternNumber}</span>
            </div>
          ` : ''}

          ${item.finishCatalog ? `
            <div class="info-item">
              <span class="info-label">Finish</span>
              <span class="info-value">${getFinishName(item.finishCatalog)}</span>
            </div>
          ` : ''}
        </div>

        ${item.notes ? `
          <div class="tracked-item-notes">"${item.notes}"</div>
        ` : ''}

        <p class="tracked-item-date">Added: ${dateAdded}</p>
      </div>

      <div class="tracked-item-actions">
        <button class="btn-edit" onclick="openEditModal('${item.skinId}')">Edit</button>
        ${item.status === 'cancelled' ? 
          `<button class="btn-delete" onclick="deleteItem('${item.skinId}')">Remove</button>` :
          `<button class="btn-delete" onclick="confirmDelete('${item.skinId}')">Cancel</button>`
          }
      </div>
    </div>
  `;
}

// Helper functions for formatting
function getPriceRangeText(item) {
  if (!item.minPrice && !item.maxPrice) return null;
  if (item.minPrice && item.maxPrice) return `$${item.minPrice} - $${item.maxPrice}`;
  if (item.minPrice) return `From $${item.minPrice}`;
  if (item.maxPrice) return `Up to $${item.maxPrice}`;
  return null;
}

function getWearConditionText(item) {
  if (item.wearType === 'any') return 'Any';
  if (item.wearType === 'preset' && item.presetWear) {
    const presets = {
      'fn': 'Factory New',
      'mw': 'Minimal Wear',
      'ft': 'Field-Tested',
      'ww': 'Well-Worn',
      'bs': 'Battle-Scarred'
    };
    return presets[item.presetWear] || 'Preset';
  }
  if (item.wearType === 'custom' && (item.minFloat || item.maxFloat)) {
    const min = item.minFloat || '0.00';
    const max = item.maxFloat || '1.00';
    return `${min} - ${max}`;
  }
  return 'Any';
}

function getStattrakText(item) {
  if (item.stattrak === 'required') return 'Required';
  if (item.stattrak === 'none') return 'No ST';
  return null;
}

function getSouvenirText(item) {
  if (item.souvenir === 'required') return 'Required';
  if (item.souvenir === 'none') return 'No Souvenir';
  return null;
}

const FINISH_NAMES = {
  418: 'Phase 1', 419: 'Phase 2', 420: 'Phase 3', 421: 'Phase 4',
  415: 'Ruby', 416: 'Sapphire', 417: 'Black Pearl', 568: 'Emerald',
  569: 'Gamma P1', 570: 'Gamma P2', 571: 'Gamma P3', 572: 'Gamma P4', 573: 'Gamma Emerald'
};

function getFinishName(finishCatalog) {
  if (!finishCatalog) return null;
  return FINISH_NAMES[finishCatalog] || `#${finishCatalog}`;
}

function setupCardEventListeners() {
  document.querySelectorAll('.tracked-item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-edit') || e.target.closest('.btn-delete')) {
        return;
      }
      const itemId = card.dataset.itemId;
      window.location.href = `item.html?id=${itemId}`;
    });
  });
}

// ============================================
// Filter Functionality
// ============================================

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTrackedItems();
    });
  });
}

// ============================================
// Edit Modal
// ============================================

function openEditModal(itemId) {
  const item = trackedItems.find(i => i.skinId === itemId);
  if (!item) return;

  editingItemId = itemId;

  document.getElementById('editModalImage').src = item.image;
  document.getElementById('editModalWeapon').textContent = item.weaponName;
  document.getElementById('editModalSkin').textContent = item.skinName;
  document.getElementById('editItemId').value = itemId;

  document.querySelector(`input[name="status"][value="${item.status || 'tracking'}"]`).checked = true;
  document.getElementById('editMinPrice').value = item.minPrice || '';
  document.getElementById('editMaxPrice').value = item.maxPrice || '';

  const wearType = item.wearType || 'any';
  document.querySelector(`#editForm input[name="wearType"][value="${wearType}"]`).checked = true;

  const presetSection = document.getElementById('editPresetWearSection');
  const customSection = document.getElementById('editCustomWearSection');
  presetSection.classList.add('hidden');
  customSection.classList.add('hidden');

  if (wearType === 'preset') {
    presetSection.classList.remove('hidden');
    document.getElementById('editPresetWear').value = item.presetWear || '';
  } else if (wearType === 'custom') {
    customSection.classList.remove('hidden');
    document.getElementById('editMinFloat').value = item.minFloat || '';
    document.getElementById('editMaxFloat').value = item.maxFloat || '';
  }

  const stattrak = item.stattrak || 'any';
  document.querySelector(`#editForm input[name="stattrak"][value="${stattrak}"]`).checked = true;

  const souvenir = item.souvenir || 'any';
  const souvenirRadio = document.querySelector(`#editForm input[name="souvenir"][value="${souvenir}"]`);
  if (souvenirRadio) souvenirRadio.checked = true;

  document.getElementById('editPatternNumber').value = item.patternNumber || '';
  document.getElementById('editNotes').value = item.notes || '';

  // Finish catalog
  const finishSelect = document.getElementById('editFinishCatalog');
  const finishCustom = document.getElementById('editFinishCatalogCustom');
  if (finishSelect && item.finishCatalog) {
    // Check if it's a known finish in the dropdown
    const option = finishSelect.querySelector(`option[value="${item.finishCatalog}"]`);
    if (option) {
      finishSelect.value = item.finishCatalog;
      if (finishCustom) finishCustom.value = '';
    } else {
      finishSelect.value = '';
      if (finishCustom) finishCustom.value = item.finishCatalog;
    }
  } else {
    if (finishSelect) finishSelect.value = '';
    if (finishCustom) finishCustom.value = '';
  }

  document.getElementById('editModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  document.body.style.overflow = '';
  editingItemId = null;
}

function setupEditModalListeners() {
  const closeBtn = document.getElementById('closeEditModal');
  const cancelBtn = document.getElementById('cancelEdit');
  const form = document.getElementById('editForm');

  if (closeBtn) closeBtn.addEventListener('click', closeEditModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditModal);

  document.querySelectorAll('#editForm input[name="wearType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const presetSection = document.getElementById('editPresetWearSection');
      const customSection = document.getElementById('editCustomWearSection');
      presetSection.classList.add('hidden');
      customSection.classList.add('hidden');

      if (e.target.value === 'preset') {
        presetSection.classList.remove('hidden');
      } else if (e.target.value === 'custom') {
        customSection.classList.remove('hidden');
      }
    });
  });

  if (form) {
    form.addEventListener('submit', handleEditSubmit);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('editModal');
      if (!modal.classList.contains('hidden')) {
        closeEditModal();
      }
    }
  });
}

async function handleEditSubmit(e) {
  e.preventDefault();

  if (!editingItemId) return;

  const formData = new FormData(e.target);
  const item = trackedItems.find(i => i.skinId === editingItemId);
  if (!item) return;

  try {
    await apiRequest(`/tracked/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        min_price: formData.get('minPrice') ? parseFloat(formData.get('minPrice')) : null,
        max_price: formData.get('maxPrice') ? parseFloat(formData.get('maxPrice')) : null,
        wear_type: formData.get('wearType'),
        preset_wear: formData.get('presetWear'),
        min_float: formData.get('minFloat') ? parseFloat(formData.get('minFloat')) : null,
        max_float: formData.get('maxFloat') ? parseFloat(formData.get('maxFloat')) : null,
        stattrak: formData.get('stattrak'),
        souvenir: formData.get('souvenir'),
        pattern_number: formData.get('patternNumber'),
        finish_catalog: formData.get('finishCatalog') || formData.get('finishCatalogCustom') || null,
        notes: formData.get('notes'),
        status: formData.get('status')
      })
    });

    showToast('Item updated successfully!');
    closeEditModal();
    await loadTrackedItems();
  } catch (error) {
    console.error('Error updating item:', error);
  }
}

// ============================================
// Delete Functionality
// ============================================

function confirmDelete(itemId) {
  const item = trackedItems.find(i => i.skinId === itemId);
  if (!item) return;

  const action = confirm(`Cancel tracking "${item.weaponName} | ${item.skinName}"?\n\nOK = Cancel tracking\nCancel = Keep tracking`);

  if (action) {
    cancelItem(itemId);
  }
}

async function cancelItem(itemId) {
  try {
    const item = trackedItems.find(i => i.skinId === itemId);
    if (!item) return;

    await apiRequest(`/tracked/${item.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' })
    });

    showToast('Tracking cancelled');
    await loadTrackedItems();
  } catch (error) {
    console.error('Error cancelling item:', error);
  }
}

async function deleteItem(itemId) {
  try {
    const item = trackedItems.find(i => i.skinId === itemId);
    if (!item) return;

    await apiRequest(`/tracked/${item.id}`, { method: 'DELETE' });

    showToast('Item removed from tracking list');
    await loadTrackedItems();
  } catch (error) {
    console.error('Error deleting item:', error);
  }
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `<span>✓ ${message}</span>`;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// Skinport Matches (Server-Side Websocket)
// ============================================

async function loadSkinportMatches() {
  const container = document.getElementById('skinportMatchesContainer');
  if (!container) return;

  const trackingItems = trackedItems.filter(item => item.status === 'tracking' || item.status === 'found');

  if (trackingItems.length === 0) {
    container.innerHTML = `
      <div class="matches-empty">
        <p>Start tracking items to see live matches from Skinport!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="matches-loading">Loading matches...</div>
  `;

  try {
    // Fetch matches from server (found via websocket)
    const matches = await apiRequest('/matches');

    // Also fetch websocket status
    let status = { connected: false };
    try {
      const statusRes = await fetch(API_URL + '/skinport/status');
      status = await statusRes.json();
    } catch (e) { /* ignore */ }

    if (matches.length === 0) {
      container.innerHTML = `
        <div class="matches-empty">
          <div class="ws-status ${status.connected ? 'ws-connected' : 'ws-disconnected'}">
            ${status.connected ? '🟢 Live Feed Connected' : '🔴 Live Feed Disconnected'}
            ${status.lastEvent ? ` — Last event: ${new Date(status.lastEvent).toLocaleTimeString()}` : ''}
          </div>
          <h3>No Matches Found Yet</h3>
          <p>The server is listening to Skinport's live feed. Matches will appear here automatically when items matching your criteria are listed.</p>
        </div>
      `;
      return;
    }

    // Group matches by tracked item
    const grouped = {};
    for (const match of matches) {
      const key = match.tracked_item_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(match);
    }

    container.innerHTML = '';

    // Status indicator
    const statusDiv = document.createElement('div');
    statusDiv.className = `ws-status ${status.connected ? 'ws-connected' : 'ws-disconnected'}`;
    statusDiv.innerHTML = `
      ${status.connected ? '🟢 Live Feed Connected' : '🔴 Live Feed Disconnected'}
      ${status.totalProcessed ? ` — ${status.totalProcessed} events processed` : ''}
    `;
    container.appendChild(statusDiv);

    // Render each group
    for (const [trackedId, itemMatches] of Object.entries(grouped)) {
      const trackedItem = trackedItems.find(i => i.id === parseInt(trackedId));
      if (!trackedItem) continue;

      const section = document.createElement('div');
      section.className = 'match-section';

      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'match-section-header';
      sectionHeader.innerHTML = `
        <img src="${trackedItem.image}" alt="${trackedItem.skinName}" class="match-item-image">
        <div class="match-item-info">
          <h3>${trackedItem.weaponName} | ${trackedItem.skinName}</h3>
          <p>${itemMatches.length} match${itemMatches.length === 1 ? '' : 'es'} found</p>
        </div>
      `;
      section.appendChild(sectionHeader);

      const grid = document.createElement('div');
      grid.className = 'listings-grid compact';

      // Sort by price (cheapest first)
      itemMatches.sort((a, b) => (a.sale_price || 0) - (b.sale_price || 0));

      itemMatches.slice(0, 10).forEach(match => {
        const card = createMatchCard(match);
        grid.appendChild(card);
      });

      section.appendChild(grid);

      if (itemMatches.length > 10) {
        const moreText = document.createElement('p');
        moreText.className = 'more-matches-text';
        moreText.textContent = `+ ${itemMatches.length - 10} more matches`;
        section.appendChild(moreText);
      }

      container.appendChild(section);
    }

    // Auto-update status for items with matches
    for (const item of trackedItems) {
      if (item.status === 'tracking' && grouped[item.id] && grouped[item.id].length > 0) {
        try {
          await apiRequest(`/tracked/${item.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'found' })
          });
          item.status = 'found';
        } catch (err) {
          console.error('Error updating status:', err);
        }
      }
    }
    updateStats();
    renderTrackedItems();

  } catch (error) {
    console.error('Error loading matches:', error);
    container.innerHTML = `
      <div class="matches-error">
        <h3>Error Loading Matches</h3>
        <p>Failed to load matches from server. Make sure the server is running.</p>
      </div>
    `;
  }
}

/**
 * Create a card for a single match from the websocket feed
 */
function createMatchCard(match) {
  const card = document.createElement('div');
  card.className = 'skinport-listing-card';

  const price = match.sale_price ? parseFloat(match.sale_price) : 0;
  const suggestedPrice = match.suggested_price ? parseFloat(match.suggested_price) : 0;
  const discount = suggestedPrice > 0 ? Math.round(((suggestedPrice - price) / suggestedPrice) * 100) : 0;
  const hasDiscount = discount > 0;

  const wearFloat = match.wear_float ? parseFloat(match.wear_float).toFixed(4) : null;
  const foundTime = match.found_at ? new Date(match.found_at).toLocaleTimeString() : '';

  card.innerHTML = `
    <div class="listing-header">
      <h4 class="listing-name">${match.market_hash_name || 'Unknown Item'}</h4>
      ${hasDiscount ? `<span class="discount-badge">-${discount}%</span>` : ''}
    </div>

    <div class="listing-info">
      ${match.exterior ? `<span class="wear-badge">${match.exterior}</span>` : ''}
      ${match.phase ? `<span class="phase-badge">${match.phase}</span>` : ''}
      ${wearFloat ? `<span class="float-badge">Float: ${wearFloat}</span>` : ''}
      ${match.pattern ? `<span class="pattern-badge">Pattern: ${match.pattern}</span>` : ''}
      ${match.stattrak ? `<span class="stattrak-badge">StatTrak™</span>` : ''}
    </div>

    <div class="listing-price">
      <div class="current-price">
        <span class="price-label">Price:</span>
        <span class="price-value">$${price.toFixed(2)}</span>
      </div>
      ${suggestedPrice && suggestedPrice !== price ? `
        <div class="suggested-price">
          <span class="price-label">Suggested:</span>
          <span class="price-value strikethrough">$${suggestedPrice.toFixed(2)}</span>
        </div>
      ` : ''}
    </div>

    <div class="listing-meta">
      <span class="found-time">Found: ${foundTime}</span>
    </div>

    <div class="listing-actions">
      ${match.skinport_url ? `
        <a href="${match.skinport_url}" target="_blank" rel="noopener noreferrer" class="btn-view-skinport">
          View on Skinport
        </a>
      ` : ''}
    </div>
  `;

  return card;
}

function setupRefreshButton() {
  const refreshBtn = document.getElementById('refreshMatches');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Scanning...';

      // Clear old matches first
      try {
        await apiRequest('/matches/clear', { method: 'DELETE' });
      } catch (err) {
        console.error('Clear error:', err);
      }

      // Trigger fresh server-side scan of existing Skinport listings
      try {
        const scanResult = await apiRequest('/matches/scan', { method: 'POST' });
        console.log('Scan result:', scanResult);
      } catch (err) {
        console.error('Scan error:', err);
      }

      // Then reload matches
      await loadSkinportMatches();

      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';

      showToast('Skinport scan complete!');
    });
  }
}

// ============================================
// Auto-refresh matches every 30 seconds
// ============================================

let matchRefreshInterval = null;

function startMatchRefresh() {
  if (matchRefreshInterval) clearInterval(matchRefreshInterval);
  matchRefreshInterval = setInterval(loadSkinportMatches, 30000); // 30 seconds
}

function stopMatchRefresh() {
  if (matchRefreshInterval) {
    clearInterval(matchRefreshInterval);
    matchRefreshInterval = null;
  }
}

// ============================================
// Notification Settings
// ============================================

async function loadNotificationSettings() {
  try {
    const settings = await apiRequest('/notifications');

    for (const setting of settings) {
      if (setting.method === 'discord') {
        const input = document.getElementById('discordWebhookUrl');
        const status = document.getElementById('discordStatus');
        const removeBtn = document.getElementById('removeDiscord');

        if (input) input.value = setting.value;
        if (status) {
          status.textContent = setting.enabled ? 'Active' : 'Disabled';
          status.className = `method-status ${setting.enabled ? 'status-active' : 'status-disabled'}`;
        }
        if (removeBtn) removeBtn.style.display = 'inline-block';
      }
    }
  } catch (error) {
    console.error('Error loading notification settings:', error);
  }
}

function setupNotificationListeners() {
  // Save Discord webhook
  const saveDiscordBtn = document.getElementById('saveDiscord');
  if (saveDiscordBtn) {
    saveDiscordBtn.addEventListener('click', async () => {
      const url = document.getElementById('discordWebhookUrl').value.trim();

      if (!url) {
        showToast('Please enter a webhook URL');
        return;
      }

      if (!url.startsWith('https://discord.com/api/webhooks/')) {
        showToast('Invalid Discord webhook URL');
        return;
      }

      try {
        saveDiscordBtn.disabled = true;
        saveDiscordBtn.textContent = 'Saving...';

        await apiRequest('/notifications', {
          method: 'POST',
          body: JSON.stringify({
            method: 'discord',
            value: url,
            enabled: true
          })
        });

        const status = document.getElementById('discordStatus');
        if (status) {
          status.textContent = 'Active';
          status.className = 'method-status status-active';
        }

        const removeBtn = document.getElementById('removeDiscord');
        if (removeBtn) removeBtn.style.display = 'inline-block';

        showToast('Discord webhook saved!');
      } catch (error) {
        console.error('Error saving Discord webhook:', error);
        showToast('Failed to save webhook');
      } finally {
        saveDiscordBtn.disabled = false;
        saveDiscordBtn.textContent = 'Save';
      }
    });
  }

  // Test Discord webhook
  const testDiscordBtn = document.getElementById('testDiscord');
  if (testDiscordBtn) {
    testDiscordBtn.addEventListener('click', async () => {
      try {
        testDiscordBtn.disabled = true;
        testDiscordBtn.textContent = 'Sending...';

        await apiRequest('/notifications/test', {
          method: 'POST',
          body: JSON.stringify({ method: 'discord' })
        });

        showToast('Test notification sent! Check your Discord.');
      } catch (error) {
        console.error('Error testing Discord webhook:', error);
        showToast('Failed to send test. Is the webhook URL saved?');
      } finally {
        testDiscordBtn.disabled = false;
        testDiscordBtn.textContent = 'Test';
      }
    });
  }

  // Remove Discord webhook
  const removeDiscordBtn = document.getElementById('removeDiscord');
  if (removeDiscordBtn) {
    removeDiscordBtn.addEventListener('click', async () => {
      if (!confirm('Remove Discord notifications?')) return;

      try {
        await apiRequest('/notifications/discord', { method: 'DELETE' });

        document.getElementById('discordWebhookUrl').value = '';
        const status = document.getElementById('discordStatus');
        if (status) {
          status.textContent = 'Not configured';
          status.className = 'method-status';
        }
        removeDiscordBtn.style.display = 'none';

        showToast('Discord webhook removed');
      } catch (error) {
        console.error('Error removing Discord webhook:', error);
      }
    });
  }
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;

  // Display username
  const usernameEl = document.getElementById('profileUsername');
  if (usernameEl && user.username) {
    usernameEl.textContent = user.username;
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch(API_URL + '/logout', { method: 'POST', credentials: 'include' });
      } catch (e) { /* ignore */ }
      window.location.href = 'login.html';
    });
  }

  await loadTrackedItems();
  setupFilters();
  setupEditModalListeners();
  setupRefreshButton();
  await loadNotificationSettings();
  setupNotificationListeners();
  await loadSkinportMatches();
  startMatchRefresh();
});