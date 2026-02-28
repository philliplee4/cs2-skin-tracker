// ============================================
// CS2 Skin Tracker - Home Page Script
// ============================================
// Note: Requires api.js to be loaded first

// Store all skins for filtering
let allSkins = [];

// ============================================
// Fetch and Render Skins
// ============================================

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function fetchSkins() {
  const grid = document.getElementById('itemsGrid');

  // Show loading state
  grid.innerHTML = '<p class="loading">Loading skins...</p>';

  try {
    // Use shared API module
    allSkins = await fetchAllSkins();

  } catch (error) {
    console.error('Error fetching skins:', error);
    grid.innerHTML = '<p class="error">Failed to load skins. Please try again later.</p>';
    throw error; // Re-throw so initialization can handle it
  }
}

function renderSkins(skins) {
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '';
  
  if (skins.length === 0) {
    grid.innerHTML = '<p class="no-results">No skins found.</p>';
    return;
  }
  
  skins.forEach(skin => {
    const card = createSkinCard(skin);
    grid.appendChild(card);
  });
}

function createSkinCard(skin) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = skin.id;
  card.dataset.category = getCategoryFromSkin(skin);
  
  // Get rarity class
  const rarityName = skin.rarity?.name || 'Consumer Grade';
  const rarityClass = getRarityClass(rarityName);
  
  // Weapon type (e.g., "AK-47")
  const weaponType = skin.weapon?.name || 'Unknown';
  
  // Skin name (e.g., "Nightwish") - remove weapon name from pattern name
  const skinName = skin.pattern?.name || skin.name || 'Unknown';
  
  // Rarity display text (e.g., "Covert Rifle")
  const categoryName = skin.category?.name || '';
  const rarityText = `${rarityName} ${categoryName}`.trim();
  
  // Check if StatTrak available
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

// Note: getCategoryFromWeapon is now in api.js

// ============================================
// Search Functionality
// ============================================

function setupSearch() {
  const searchBar = document.getElementById('searchBar');
  
  if (!searchBar) return;
  
  let debounceTimer;
  
  searchBar.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
      const query = e.target.value.toLowerCase().trim();
      
      if (query === '') {
        renderSkins(allSkins);
        return;
      }
      
      const filtered = allSkins.filter(skin => {
        const weaponName = (skin.weapon?.name || '').toLowerCase();
        const skinName = (skin.pattern?.name || skin.name || '').toLowerCase();
        const fullName = `${weaponName} ${skinName}`;
        
        return fullName.includes(query);
      });
      
      renderSkins(filtered);
    }, 300);
  });
}

// Note: Dropdown menus are now handled by navigation.js
// Note: Helper functions (getCategoryFromWeapon, getCategoryDisplayName) are in api.js

function filterByCategory(category) {
  const filtered = allSkins.filter(skin => getCategoryFromSkin(skin) === category);

  renderSkins(filtered);

  // Update URL
  history.pushState({}, '', `?category=${category}`);
}

function filterByWeapon(weaponName) {
  const filtered = allSkins.filter(skin => {
    return skin.weapon?.name === weaponName;
  });

  renderSkins(filtered);

  // Update URL
  const weaponSlug = weaponName.toLowerCase().replace(/\s+/g, '-');
  history.pushState({}, '', `?weapon=${weaponSlug}`);
}

// ============================================
// Category Filter (Nav Links)
// ============================================

function setupCategoryFilters() {
  const dropdownTriggers = document.querySelectorAll('.dropdown-trigger');

  dropdownTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();

      const category = trigger.dataset.category;

      if (category && allSkins.length > 0) {
        const filtered = allSkins.filter(skin => getCategoryFromSkin(skin) === category);

        renderSkins(filtered);

        // Update URL without reload
        history.pushState({}, '', `?category=${category}`);
      }
    });
  });
}

// ============================================
// URL Parameter Handling
// ============================================

function handleURLParameters() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');
  const weaponSlug = params.get('weapon');

  if (weaponSlug) {
    // Convert slug back to weapon name (e.g., "ak-47" -> "AK-47")
    const weaponName = allSkins.find(skin => {
      const slug = (skin.weapon?.name || '').toLowerCase().replace(/\s+/g, '-');
      return slug === weaponSlug;
    })?.weapon?.name;

    if (weaponName) {
      filterByWeapon(weaponName);
      return true;
    }
  }

  if (category) {
    filterByCategory(category);
    return true;
  }

  return false;
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await fetchSkins();

  // Check if we need to filter based on URL parameters
  const hasFiltered = handleURLParameters();

  // Only show random skins if no filter was applied
  if (!hasFiltered) {
    const randomizedSkins = shuffleArray(allSkins);
    renderSkins(randomizedSkins);
  }

  setupSearch();
  setupCategoryFilters();
});