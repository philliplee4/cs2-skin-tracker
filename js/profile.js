// ============================================
// CS2 Skin Tracker - Profile/Dashboard Page
// ============================================

let trackedItems = [];
let currentFilter = 'all';
let editingItemId = null;

// ============================================
// Load and Display Tracked Items
// ============================================

function loadTrackedItems() {
  // Get items from localStorage
  trackedItems = JSON.parse(localStorage.getItem('trackedItems') || '[]');

  // Add default status if not present
  trackedItems = trackedItems.map(item => ({
    ...item,
    status: item.status || 'tracking'
  }));

  updateStats();
  renderTrackedItems();
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

  // Filter items based on current filter
  let filteredItems = trackedItems;
  if (currentFilter !== 'all') {
    filteredItems = trackedItems.filter(item => item.status === currentFilter);
  }

  // Show empty state if no items
  if (filteredItems.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  // Sort by date (newest first)
  filteredItems.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

  // Render items
  container.innerHTML = filteredItems.map(item => createTrackedItemCard(item)).join('');

  // Add event listeners
  setupCardEventListeners();
}

function createTrackedItemCard(item) {
  const statusClass = `status-${item.status}`;
  const statusText = {
    'tracking': '🟡 Tracking',
    'found': '🟢 Found',
    'cancelled': '🔴 Cancelled'
  }[item.status] || '🟡 Tracking';

  // Format tracking details
  const priceRange = getPriceRangeText(item);
  const wearCondition = getWearConditionText(item);
  const stattrakText = getStattrakText(item);
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

          ${item.patternNumber ? `
            <div class="info-item">
              <span class="info-label">Pattern</span>
              <span class="info-value">#${item.patternNumber}</span>
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
  return null; // Don't show if "any"
}

function setupCardEventListeners() {
  // Card click to view item details
  document.querySelectorAll('.tracked-item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Ignore if clicking on buttons
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
      // Update active state
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update filter and re-render
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

  // Populate modal
  document.getElementById('editModalImage').src = item.image;
  document.getElementById('editModalWeapon').textContent = item.weaponName;
  document.getElementById('editModalSkin').textContent = item.skinName;
  document.getElementById('editItemId').value = itemId;

  // Set form values
  document.querySelector(`input[name="status"][value="${item.status || 'tracking'}"]`).checked = true;
  document.getElementById('editMinPrice').value = item.minPrice || '';
  document.getElementById('editMaxPrice').value = item.maxPrice || '';

  // Wear type
  const wearType = item.wearType || 'any';
  document.querySelector(`#editForm input[name="wearType"][value="${wearType}"]`).checked = true;

  // Show/hide conditional sections
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

  // StatTrak
  const stattrak = item.stattrak || 'any';
  document.querySelector(`#editForm input[name="stattrak"][value="${stattrak}"]`).checked = true;

  // Pattern and notes
  document.getElementById('editPatternNumber').value = item.patternNumber || '';
  document.getElementById('editNotes').value = item.notes || '';

  // Show modal
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

  // Wear type changes
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

  // Form submission
  if (form) {
    form.addEventListener('submit', handleEditSubmit);
  }

  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('editModal');
      if (!modal.classList.contains('hidden')) {
        closeEditModal();
      }
    }
  });
}

function handleEditSubmit(e) {
  e.preventDefault();

  if (!editingItemId) return;

  const formData = new FormData(e.target);
  const itemIndex = trackedItems.findIndex(item => item.skinId === editingItemId);

  if (itemIndex === -1) return;

  // Update item
  trackedItems[itemIndex] = {
    ...trackedItems[itemIndex],
    status: formData.get('status'),
    minPrice: formData.get('minPrice') ? parseFloat(formData.get('minPrice')) : null,
    maxPrice: formData.get('maxPrice') ? parseFloat(formData.get('maxPrice')) : null,
    wearType: formData.get('wearType'),
    presetWear: formData.get('presetWear'),
    minFloat: formData.get('minFloat') ? parseFloat(formData.get('minFloat')) : null,
    maxFloat: formData.get('maxFloat') ? parseFloat(formData.get('maxFloat')) : null,
    stattrak: formData.get('stattrak'),
    patternNumber: formData.get('patternNumber'),
    notes: formData.get('notes')
  };

  // Save to localStorage
  localStorage.setItem('trackedItems', JSON.stringify(trackedItems));

  // Show success toast
  showToast('Item updated successfully!');

  // Close modal and refresh
  closeEditModal();
  loadTrackedItems();
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

function cancelItem(itemId) {
  const itemIndex = trackedItems.findIndex(item => item.skinId === itemId);
  if (itemIndex === -1) return;

  trackedItems[itemIndex].status = 'cancelled';
  localStorage.setItem('trackedItems', JSON.stringify(trackedItems));

  showToast('Tracking cancelled');
  updateStats();
  renderTrackedItems();
}

function deleteItem(itemId) {
  trackedItems = trackedItems.filter(item => item.skinId !== itemId);
  localStorage.setItem('trackedItems', JSON.stringify(trackedItems));

  showToast('Item removed from tracking list');
  loadTrackedItems();
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
// Skinport Integration
// ============================================

async function loadSkinportMatches() {
  const container = document.getElementById('skinportMatchesContainer');

  if (!container) return;

  const trackingItems = trackedItems.filter(item => item.status === 'tracking' || item.status === 'found');

  if (trackingItems.length === 0) {
    container.innerHTML = `
      <div class="listings-empty">
        <p>Start tracking items to see matches from Skinport!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="listings-empty">
      <p>Searching Skinport for matches...</p>
    </div>
  `;

  // Display matches and get results
  const matchResults = await getAndDisplayMatches(trackingItems, container);

  // Auto-update status based on matches
  if (matchResults) {
    let updated = false;
    for (const item of trackedItems) {
      if (item.status === 'tracking' && matchResults[item.skinId] && matchResults[item.skinId].length > 0) {
        item.status = 'found';
        updated = true;
      }
    }
    if (updated) {
      localStorage.setItem('trackedItems', JSON.stringify(trackedItems));
      updateStats();
      renderTrackedItems();
    }
  }
}

function showSkinportSettingsModal() {
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'skinportSettingsModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>Skinport API Settings</h2>
        <button class="modal-close" id="closeSkinportSettings">&times;</button>
      </div>
      <div class="modal-body" id="skinportSettingsBody">
        <!-- Settings form will be inserted here -->
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Insert settings form
  const settingsBody = document.getElementById('skinportSettingsBody');
  const settingsForm = createSkinportSettingsForm();
  settingsBody.appendChild(settingsForm);

  // Setup listeners
  setupSkinportSettingsListeners();

  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Close button
  const closeBtn = document.getElementById('closeSkinportSettings');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.remove();
      document.body.style.overflow = '';
      // Reload matches after settings change
      loadSkinportMatches();
    });
  }

  // Close on overlay click
  const overlay = modal.querySelector('.modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      modal.remove();
      document.body.style.overflow = '';
      loadSkinportMatches();
    });
  }
}

function setupRefreshButton() {
  const refreshBtn = document.getElementById('refreshMatches');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';

      // Clear cache to force fresh data
      itemsCache = null;
      itemsCacheTimestamp = null;

      await loadSkinportMatches();

      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';

      showToast('Skinport data refreshed!');
    });
  }
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  loadTrackedItems();
  setupFilters();
  setupEditModalListeners();
  setupRefreshButton();

  // Load Skinport matches
  loadSkinportMatches();

  // Auto-refresh every 5 minutes
  startAutoRefresh(loadSkinportMatches, 5);
});
