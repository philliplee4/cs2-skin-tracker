// ============================================
// CS2 Skin Tracker - Home Page Script
// ============================================
// Note: Requires api.js to be loaded first

// Store all skins for filtering
let allSkins = [];
let activeCategory = 'all';
let activeWeapon = null;
let activeSort = 'default';

// Rarity order for sorting (higher = rarer)
const RARITY_ORDER = {
  'Consumer Grade': 1,
  'Industrial Grade': 2,
  'Mil-Spec Grade': 3,
  'Restricted': 4,
  'Classified': 5,
  'Covert': 6,
  'Extraordinary': 7
};

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

// Always returns the currently filtered set before sorting
function getActiveBase() {
  if (activeWeapon) {
    return allSkins.filter(skin => skin.weapon?.name === activeWeapon);
  }
  if (activeCategory !== 'all') {
    return allSkins.filter(skin => getCategoryFromSkin(skin) === activeCategory);
  }
  return allSkins;
}

function sortSkins(skins) {
  const sorted = [...skins];
  switch (activeSort) {
    case 'name-asc':
      return sorted.sort((a, b) => {
        const nameA = `${a.weapon?.name || ''} ${a.pattern?.name || a.name || ''}`.toLowerCase();
        const nameB = `${b.weapon?.name || ''} ${b.pattern?.name || b.name || ''}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
    case 'name-desc':
      return sorted.sort((a, b) => {
        const nameA = `${a.weapon?.name || ''} ${a.pattern?.name || a.name || ''}`.toLowerCase();
        const nameB = `${b.weapon?.name || ''} ${b.pattern?.name || b.name || ''}`.toLowerCase();
        return nameB.localeCompare(nameA);
      });
    case 'rarity-asc':
      return sorted.sort((a, b) => {
        const rA = RARITY_ORDER[a.rarity?.name] || 0;
        const rB = RARITY_ORDER[b.rarity?.name] || 0;
        return rA - rB;
      });
    case 'rarity-desc':
      return sorted.sort((a, b) => {
        const rA = RARITY_ORDER[a.rarity?.name] || 0;
        const rB = RARITY_ORDER[b.rarity?.name] || 0;
        return rB - rA;
      });
    default:
      return sorted; // keep shuffle order from initial load
  }
}

function setupSortBar() {
  const buttons = document.querySelectorAll('.sort-btn');
  if (!buttons.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSort = btn.dataset.sort;

      const searchBar = document.getElementById('searchBar');
      const query = searchBar?.value.toLowerCase().trim() || '';

      let base = getActiveBase();

      if (query) {
        base = base.filter(skin => {
          const fullName = `${skin.weapon?.name || ''} ${skin.pattern?.name || skin.name || ''}`.toLowerCase();
          return fullName.includes(query);
        });
      }

      renderSkins(sortSkins(base));
    });
  });
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

      const base = getActiveBase();

      if (query === '') {
        renderSkins(sortSkins(base));
        return;
      }

      const filtered = base.filter(skin => {
        const weaponName = (skin.weapon?.name || '').toLowerCase();
        const skinName = (skin.pattern?.name || skin.name || '').toLowerCase();
        const fullName = `${weaponName} ${skinName}`;
        return fullName.includes(query);
      });

      renderSkins(sortSkins(filtered));
    }, 300);
  });
}

// Note: Dropdown menus are now handled by navigation.js
// Note: Helper functions (getCategoryFromWeapon, getCategoryDisplayName) are in api.js

function filterByCategory(category) {
  activeCategory = category;
  activeWeapon = null;
  const filtered = allSkins.filter(skin => getCategoryFromSkin(skin) === category);
  renderSkins(sortSkins(filtered));
  history.pushState({}, '', `?category=${category}`);
}

function filterByWeapon(weaponName) {
  activeWeapon = weaponName;
  activeCategory = 'all';
  const filtered = allSkins.filter(skin => skin.weapon?.name === weaponName);
  renderSkins(sortSkins(filtered));
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

async function loadDashboardSummary() {
  try {
    // Check login state first — apiRequest throws if not logged in
    const me = await apiRequest('/me');
    if (!me || !me.user) return;

    const [tracked, matches] = await Promise.all([
      apiRequest('/tracked'),
      apiRequest('/matches')
    ]);

    const totalTracked  = tracked.length;
    const totalMatches  = matches.filter(m => m.source !== 'dmarket').length;
    const stillTracking = tracked.filter(i => i.status === 'tracking').length;

    document.getElementById('dashTracked').textContent  = totalTracked;
    document.getElementById('dashMatches').textContent  = totalMatches;
    document.getElementById('dashTracking').textContent = stillTracking;

    document.getElementById('dashboardSummary').classList.remove('hidden');
  } catch (_) {
    // Not logged in or API unavailable — keep summary hidden
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchSkins();

  const hasFiltered = handleURLParameters();

  if (hasFiltered) {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('category');
    if (cat) activeCategory = cat;
  } else {
    renderSkins(shuffleArray(allSkins));
  }

  setupSearch();
  setupSortBar();
  setupCategoryFilters();
  loadDashboardSummary();
});