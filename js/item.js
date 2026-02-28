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

function handleTrackingSubmit(e) {
  e.preventDefault();

  if (!currentSkin) return;

  const formData = new FormData(e.target);

  // Build tracking object
  const trackingData = {
    id: currentSkin.id,
    skinId: currentSkin.id,
    weaponName: currentSkin.weapon?.name || 'Unknown',
    skinName: currentSkin.pattern?.name || currentSkin.name || 'Unknown',
    image: currentSkin.image,
    rarity: currentSkin.rarity?.name,
    category: currentSkin.category?.name,
    dateAdded: new Date().toISOString(),

    // Price range
    minPrice: formData.get('minPrice') ? parseFloat(formData.get('minPrice')) : null,
    maxPrice: formData.get('maxPrice') ? parseFloat(formData.get('maxPrice')) : null,

    // Wear condition
    wearType: formData.get('wearType'),
    presetWear: formData.get('presetWear'),
    minFloat: formData.get('minFloat') ? parseFloat(formData.get('minFloat')) : null,
    maxFloat: formData.get('maxFloat') ? parseFloat(formData.get('maxFloat')) : null,

    // StatTrak
    stattrak: formData.get('stattrak'),

    // Pattern & Notes
    patternNumber: formData.get('patternNumber'),
    notes: formData.get('notes')
  };

  // Save to localStorage
  saveTrackedItem(trackingData);

  // Show success message
  showSuccessToast();

  // Close modal
  closeTrackingModal();
}

function saveTrackedItem(trackingData) {
  // Get existing tracked items
  let trackedItems = JSON.parse(localStorage.getItem('trackedItems') || '[]');

  // Check if item is already tracked
  const existingIndex = trackedItems.findIndex(item => item.skinId === trackingData.skinId);

  if (existingIndex !== -1) {
    // Update existing item
    trackedItems[existingIndex] = trackingData;
  } else {
    // Add new item
    trackedItems.push(trackingData);
  }

  // Save back to localStorage
  localStorage.setItem('trackedItems', JSON.stringify(trackedItems));
}

function showSuccessToast() {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <span>✓ Item added to tracking list!</span>
  `;

  document.body.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  loadItemDetails();
  setupModalEventListeners();
});
