// ============================================
// CS2 Skin Tracker - Shared API Module
// ============================================

const SKINS_API_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';

// Cache for skins data
let skinsCache = null;

// ============================================
// API Functions
// ============================================

/**
 * Fetch all skins from the API (with caching)
 */
async function fetchAllSkins() {
  // Return cached data if available
  if (skinsCache) {
    return skinsCache;
  }

  try {
    const response = await fetch(SKINS_API_URL);

    if (!response.ok) {
      throw new Error('Failed to fetch skins');
    }

    skinsCache = await response.json();
    return skinsCache;

  } catch (error) {
    console.error('Error fetching skins:', error);
    throw error;
  }
}

/**
 * Get a single skin by ID
 */
async function getSkinById(id) {
  const skins = await fetchAllSkins();
  return skins.find(skin => skin.id === id);
}

/**
 * Get all skins for a specific weapon
 */
async function getSkinsByWeapon(weaponName) {
  const skins = await fetchAllSkins();
  return skins.filter(skin => skin.weapon?.name === weaponName);
}

/**
 * Get all skins for a specific category
 */
async function getSkinsByCategory(category) {
  const skins = await fetchAllSkins();
  return skins.filter(skin => getCategoryFromSkin(skin) === category);
}

/**
 * Search skins by query
 */
async function searchSkins(query) {
  const skins = await fetchAllSkins();
  const lowerQuery = query.toLowerCase().trim();

  return skins.filter(skin => {
    const weaponName = (skin.weapon?.name || '').toLowerCase();
    const skinName = (skin.pattern?.name || skin.name || '').toLowerCase();
    const fullName = `${weaponName} ${skinName}`;

    return fullName.includes(lowerQuery);
  });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get category from skin object (uses API category data)
 */
function getCategoryFromSkin(skin) {
  const categoryName = (skin.category?.name || '').toLowerCase();
  const weaponName = skin.weapon?.name || '';

  // Check category field first (most reliable)
  if (categoryName.includes('pistol')) return 'pistol';
  if (categoryName.includes('smg')) return 'smg';
  if (categoryName.includes('rifle') || categoryName.includes('sniper')) return 'rifle';
  if (categoryName.includes('shotgun') || categoryName.includes('machinegun')) return 'heavy';
  if (categoryName.includes('knife') || categoryName.includes('melee')) return 'knife';
  if (categoryName.includes('glove')) return 'gloves';

  // Fallback to weapon name matching
  return getCategoryFromWeapon(weaponName);
}

/**
 * Get category from weapon name (fallback method)
 */
function getCategoryFromWeapon(weaponName) {
  const pistols = ['Glock-18', 'USP-S', 'P2000', 'P250', 'Five-SeveN', 'CZ75-Auto', 'Tec-9', 'Desert Eagle', 'R8 Revolver', 'Dual Berettas'];
  const smgs = ['MAC-10', 'MP9', 'MP7', 'MP5-SD', 'UMP-45', 'P90', 'PP-Bizon'];
  const rifles = ['AK-47', 'M4A4', 'M4A1-S', 'Galil AR', 'FAMAS', 'SG 553', 'AUG', 'AWP', 'SSG 08', 'SCAR-20', 'G3SG1'];
  const heavy = ['Nova', 'XM1014', 'MAG-7', 'Sawed-Off', 'M249', 'Negev'];
  const knives = ['Knife', 'Bayonet', 'Karambit', 'M9 Bayonet', 'Butterfly', 'Flip Knife', 'Gut Knife', 'Huntsman', 'Falchion', 'Bowie', 'Shadow Daggers', 'Navaja', 'Stiletto', 'Talon', 'Ursus', 'Classic Knife', 'Paracord', 'Survival', 'Nomad', 'Skeleton'];

  if (pistols.some(p => weaponName.includes(p))) return 'pistol';
  if (smgs.some(s => weaponName.includes(s))) return 'smg';
  if (rifles.some(r => weaponName.includes(r))) return 'rifle';
  if (heavy.some(h => weaponName.includes(h))) return 'heavy';
  if (knives.some(k => weaponName.includes(k))) return 'knife';
  if (weaponName.includes('Gloves') || weaponName.includes('Wraps') || weaponName.includes('Hand')) return 'gloves';

  return 'other';
}

/**
 * Get category display name
 */
function getCategoryDisplayName(category) {
  const displayNames = {
    'pistol': 'Pistols',
    'smg': 'SMGs',
    'rifle': 'Rifles',
    'knife': 'Knives',
    'gloves': 'Gloves',
    'heavy': 'Heavy',
    'other': 'Other'
  };
  return displayNames[category] || category;
}

/**
 * Rarity name mapping to CSS class
 */
const rarityClasses = {
  'Covert': 'covert',
  'Classified': 'classified',
  'Restricted': 'restricted',
  'Mil-Spec Grade': 'milspec',
  'Industrial Grade': 'industrial',
  'Consumer Grade': 'consumer'
};

/**
 * Get rarity CSS class
 */
function getRarityClass(rarityName) {
  return rarityClasses[rarityName] || 'consumer';
}
