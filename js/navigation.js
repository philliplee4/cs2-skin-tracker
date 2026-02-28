// ============================================
// CS2 Skin Tracker - Shared Navigation
// ============================================
// Handles dropdown menus and search for all pages

// ============================================
// Dropdown Menus - Dynamic Population
// ============================================

async function populateDropdowns() {
  try {
    const allSkins = await fetchAllSkins();

    if (allSkins.length === 0) return;

    const categories = ['pistol', 'smg', 'rifle', 'knife', 'gloves'];

    categories.forEach(category => {
      const dropdown = document.getElementById(`dropdown-${category}`);
      if (!dropdown) return;

      // Get unique weapons for this category
      const weaponsMap = new Map();

      allSkins.forEach(skin => {
        const weaponName = skin.weapon?.name;
        if (!weaponName) return;

        const skinCategory = getCategoryFromSkin(skin);
        if (skinCategory !== category) return;

        if (!weaponsMap.has(weaponName)) {
          weaponsMap.set(weaponName, {
            name: weaponName,
            image: skin.image,
            id: skin.weapon.id
          });
        }
      });

      // Convert to array and sort alphabetically
      const weapons = Array.from(weaponsMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      // Clear existing content
      dropdown.innerHTML = '';

      // Add "All" option at the top
      const allOption = document.createElement('div');
      allOption.className = 'dropdown-item dropdown-all';
      allOption.innerHTML = `<span>All ${getCategoryDisplayName(category)}</span>`;
      allOption.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `index.html?category=${category}`;
      });
      dropdown.appendChild(allOption);

      // Add separator if there are weapons
      if (weapons.length > 0) {
        const separator = document.createElement('div');
        separator.className = 'dropdown-separator';
        dropdown.appendChild(separator);
      }

      // Populate dropdown
      weapons.forEach(weapon => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `
          <img src="${weapon.image}" alt="${weapon.name}" onerror="this.style.display='none'">
          <span>${weapon.name}</span>
        `;

        item.addEventListener('click', (e) => {
          e.preventDefault();
          const weaponSlug = weapon.name.toLowerCase().replace(/\s+/g, '-');
          window.location.href = `index.html?weapon=${weaponSlug}`;
        });

        dropdown.appendChild(item);
      });
    });
  } catch (error) {
    console.error('Error populating dropdowns:', error);
  }
}

// Initialize dropdowns when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateDropdowns);
} else {
  populateDropdowns();
}
