async function checkP90() {
  try {
    const response = await fetch('https://api.skinport.com/v1/items');
    const items = await response.json();
    
    const p90Items = items.filter(item => 
      item.market_hash_name && 
      item.market_hash_name.toLowerCase().includes('p90') && 
      item.market_hash_name.toLowerCase().includes('chopper')
    );
    
    console.log('P90 Chopper listings found:', p90Items.length);
    
    if (p90Items.length > 0) {
      p90Items.forEach(item => {
        const price = (item.min_price / 100).toFixed(2);
        console.log(`  ${item.market_hash_name} - €${price}`);
      });
    } else {
      console.log('\n⚠️  P90 | Chopper NOT available on Skinport');
      console.log('\nSearching for any P90 skins...');
      const anyP90 = items.filter(item => 
        item.market_hash_name && 
        item.market_hash_name.includes('P90')
      );
      console.log(`Found ${anyP90.length} P90 skins total`);
      console.log('\nFirst 5 P90 skins:');
      anyP90.slice(0, 5).forEach(item => {
        const price = (item.min_price / 100).toFixed(2);
        console.log(`  ${item.market_hash_name} - €${price}`);
      });
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

checkP90();
