// Simulate the matching algorithm
async function testMatching() {
  console.log('Testing matching algorithm...\n');
  
  // Fetch Skinport items
  const response = await fetch('https://api.skinport.com/v1/items');
  const allItems = await response.json();
  console.log(`Total Skinport items: ${allItems.length}\n`);
  
  // Test criteria for P90 Chopper
  const p90Criteria = {
    weaponName: 'P90',
    skinName: 'Chopper',
    maxPrice: 10,
    wearType: 'any',
    stattrak: 'any'
  };
  
  console.log('=== Testing P90 | Chopper ===');
  console.log('Criteria:', JSON.stringify(p90Criteria, null, 2));
  
  // Step 1: Filter by name
  let matches = allItems.filter(item => {
    const itemName = (item.market_hash_name || '').toLowerCase();
    const weapon = p90Criteria.weaponName.toLowerCase();
    const skin = p90Criteria.skinName.toLowerCase();
    return itemName.includes(weapon) && itemName.includes(skin);
  });
  console.log(`\nAfter name filter: ${matches.length} items`);
  
  // Step 2: Filter by price (EUR to USD conversion needed!)
  const EUR_TO_USD = 1.1; // Approximate
  matches = matches.filter(item => {
    const priceEUR = (item.min_price || item.suggested_price || 0) / 100;
    const priceUSD = priceEUR * EUR_TO_USD;
    
    if (p90Criteria.maxPrice && priceUSD > p90Criteria.maxPrice) {
      return false;
    }
    return true;
  });
  console.log(`After price filter (≤$${p90Criteria.maxPrice}): ${matches.length} items`);
  
  // Show results
  if (matches.length > 0) {
    console.log('\n✓ Matches found:');
    matches.forEach(item => {
      const priceEUR = (item.min_price / 100).toFixed(2);
      const priceUSD = (priceEUR * EUR_TO_USD).toFixed(2);
      console.log(`  ${item.market_hash_name}: €${priceEUR} (~$${priceUSD})`);
    });
  } else {
    console.log('\n✗ No matches found!');
  }
  
  // Test CZ75
  console.log('\n\n=== Testing CZ75-AUTO | Copper Fiber ===');
  const cz75Criteria = {
    weaponName: 'CZ75-Auto',
    skinName: 'Copper Fiber',
    wearType: 'any',
    stattrak: 'any'
  };
  
  const cz75Matches = allItems.filter(item => {
    const itemName = (item.market_hash_name || '').toLowerCase();
    // CZ75-Auto might be listed as "CZ75-AUTO" or "CZ75 Auto" on Skinport
    return (itemName.includes('cz75') || itemName.includes('cz-75')) && 
           itemName.includes('copper');
  });
  
  console.log(`Found ${cz75Matches.length} CZ75 Copper Fiber items`);
  if (cz75Matches.length > 0) {
    cz75Matches.forEach(item => {
      const price = (item.min_price / 100).toFixed(2);
      console.log(`  ${item.market_hash_name}: €${price}`);
    });
  }
}

testMatching();
