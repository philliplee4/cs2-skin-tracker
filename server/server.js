require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcrypt');
const https = require('https');
const zlib = require('zlib');
const pool = require('./db');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ============================================
// Auth Middleware
// ============================================

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// ============================================
// Auth Routes
// ============================================

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );

    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.username = user.username;

    res.status(201).json({ message: 'Account created', user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, email, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ message: 'Logged in', user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ message: 'Logged out' });
  });
});

// Get current user
app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({ user: { id: req.session.userId, username: req.session.username } });
});

// ============================================
// Tracked Items Routes
// ============================================

// Get all tracked items for current user
app.get('/api/tracked', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tracked_items WHERE user_id = $1 ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tracked items:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a tracked item
app.post('/api/tracked', requireAuth, async (req, res) => {
  const {
    skin_id, weapon_name, skin_name, image_url, rarity, category,
    min_price, max_price, wear_type, preset_wear, min_float, max_float,
    stattrak, pattern_number, finish_catalog, notes
  } = req.body;

  if (!skin_id || !weapon_name || !skin_name) {
    return res.status(400).json({ error: 'skin_id, weapon_name, and skin_name are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tracked_items 
        (user_id, skin_id, weapon_name, skin_name, image_url, rarity, category,
         min_price, max_price, wear_type, preset_wear, min_float, max_float,
         stattrak, pattern_number, finish_catalog, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [req.session.userId, skin_id, weapon_name, skin_name, image_url, rarity, category,
       min_price || null, max_price || null, wear_type || 'any', preset_wear || null,
       min_float || null, max_float || null, stattrak || 'any', pattern_number || null,
       finish_catalog || null, notes || null]
    );
    res.status(201).json(result.rows[0]);

    // Check existing Skinport listings for this new tracked item (async, don't block response)
    checkExistingListingsForItem(result.rows[0]).catch(err => {
      console.error('Error checking existing listings for new item:', err.message);
    });
  } catch (error) {
    console.error('Error adding tracked item:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a tracked item
app.put('/api/tracked/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    min_price, max_price, wear_type, preset_wear, min_float, max_float,
    stattrak, pattern_number, finish_catalog, notes, status
  } = req.body;

  try {
    const check = await pool.query(
      'SELECT id FROM tracked_items WHERE id = $1 AND user_id = $2',
      [id, req.session.userId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const result = await pool.query(
      `UPDATE tracked_items SET
        min_price = $1, max_price = $2, wear_type = $3, preset_wear = $4,
        min_float = $5, max_float = $6, stattrak = $7, pattern_number = $8,
        notes = $9, status = $10, finish_catalog = $11, updated_at = NOW()
       WHERE id = $12 AND user_id = $13
       RETURNING *`,
      [min_price || null, max_price || null, wear_type || 'any', preset_wear || null,
       min_float || null, max_float || null, stattrak || 'any', pattern_number || null,
       notes || null, status || 'tracking', finish_catalog || null, id, req.session.userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating tracked item:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a tracked item
app.delete('/api/tracked/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM tracked_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item deleted' });
  } catch (error) {
    console.error('Error deleting tracked item:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update item status only
app.patch('/api/tracked/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['tracking', 'found', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      'UPDATE tracked_items SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, id, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// Skinport Matches Routes
// ============================================

// Get matches for current user
app.get('/api/matches', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sm.*, ti.weapon_name, ti.skin_name, ti.image_url, ti.min_price as target_min, ti.max_price as target_max
       FROM skinport_matches sm
       JOIN tracked_items ti ON sm.tracked_item_id = ti.id
       WHERE ti.user_id = $1
       ORDER BY sm.found_at DESC
       LIMIT 100`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get matches for a specific tracked item
app.get('/api/matches/:trackedItemId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sm.* FROM skinport_matches sm
       JOIN tracked_items ti ON sm.tracked_item_id = ti.id
       WHERE sm.tracked_item_id = $1 AND ti.user_id = $2
       ORDER BY sm.found_at DESC
       LIMIT 50`,
      [req.params.trackedItemId, req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching item matches:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear old matches (older than 24 hours)
app.delete('/api/matches/cleanup', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM skinport_matches
       WHERE found_at < NOW() - INTERVAL '24 hours'
       AND tracked_item_id IN (SELECT id FROM tracked_items WHERE user_id = $1)
       RETURNING id`,
      [req.session.userId]
    );
    res.json({ deleted: result.rows.length });
  } catch (error) {
    console.error('Error cleaning up matches:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear ALL matches for current user (used before rescan)
app.delete('/api/matches/clear', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM skinport_matches
       WHERE tracked_item_id IN (SELECT id FROM tracked_items WHERE user_id = $1)
       RETURNING id`,
      [req.session.userId]
    );
    res.json({ deleted: result.rows.length });
  } catch (error) {
    console.error('Error clearing matches:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get websocket connection status
app.get('/api/skinport/status', (req, res) => {
  res.json({
    connected: skinportConnected,
    lastEvent: lastEventTime ? lastEventTime.toISOString() : null,
    totalProcessed: totalEventsProcessed
  });
});

// ============================================
// Skinport REST API - Initial & On-Demand Scan
// ============================================

// Cache for REST API data
let skinportItemsCache = null;
let skinportCacheTime = null;
const SKINPORT_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch all items from Skinport REST API (with caching)
 */
function fetchSkinportItemsREST() {
  return new Promise((resolve, reject) => {
    const now = Date.now();

    // Return cache if fresh
    if (skinportItemsCache && skinportCacheTime && (now - skinportCacheTime < SKINPORT_CACHE_DURATION)) {
      return resolve(skinportItemsCache);
    }

    const url = 'https://api.skinport.com/v1/items?app_id=730&currency=USD';

    https.get(url, { headers: { 'Accept-Encoding': 'br, gzip, deflate' } }, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];

        const handleData = (data) => {
          try {
            const items = JSON.parse(data);
            if (Array.isArray(items)) {
              skinportItemsCache = items;
              skinportCacheTime = Date.now();
              resolve(items);
            } else {
              reject(new Error('Skinport API returned non-array'));
            }
          } catch (e) {
            reject(new Error('Failed to parse Skinport response'));
          }
        };

        if (encoding === 'br') {
          zlib.brotliDecompress(buffer, (err, result) => {
            if (err) return reject(err);
            handleData(result.toString());
          });
        } else if (encoding === 'gzip') {
          zlib.gunzip(buffer, (err, result) => {
            if (err) return reject(err);
            handleData(result.toString());
          });
        } else {
          handleData(buffer.toString());
        }
      });
    }).on('error', reject);
  });
}

/**
 * Check if a REST API item matches a tracked item
 * (REST API items have different fields than websocket items)
 */
function doesRESTItemMatch(item, tracked) {
  const itemName = (item.market_hash_name || '').toLowerCase();
  const trackedWeapon = (tracked.weapon_name || '').toLowerCase();
  const trackedSkin = (tracked.skin_name || '').toLowerCase();

  // Must contain both weapon and skin name
  if (!itemName.includes(trackedWeapon) || !itemName.includes(trackedSkin)) {
    return false;
  }

  // Check price (REST API prices are already in dollars)
  const price = item.min_price || item.suggested_price;
  if (price) {
    if (tracked.min_price && price < parseFloat(tracked.min_price)) {
      return false;
    }
    if (tracked.max_price && price > parseFloat(tracked.max_price)) {
      return false;
    }
  }

  // Check StatTrak
  if (tracked.stattrak === 'required' && !itemName.includes('stattrak')) {
    return false;
  }
  if (tracked.stattrak === 'none' && itemName.includes('stattrak')) {
    return false;
  }

  // Check wear condition by name (REST API doesn't have float values)
  if (tracked.wear_type === 'preset' && tracked.preset_wear) {
    const wearRange = WEAR_RANGES[tracked.preset_wear];
    if (wearRange) {
      if (!itemName.includes(wearRange.name.toLowerCase())) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check existing Skinport listings for a single tracked item
 */
async function checkExistingListingsForItem(trackedItem) {
  if (trackedItem.status !== 'tracking') return;

  console.log(`🔍 Checking existing Skinport listings for: ${trackedItem.weapon_name} | ${trackedItem.skin_name}`);

  try {
    const items = await fetchSkinportItemsREST();
    let matchCount = 0;

    for (const item of items) {
      if (doesRESTItemMatch(item, trackedItem)) {
        // Save as a match (use negative sale_id to distinguish from websocket matches)
        const fakeSaleId = -(Date.now() + Math.floor(Math.random() * 10000));

        try {
          await pool.query(
            `INSERT INTO skinport_matches 
              (tracked_item_id, sale_id, market_hash_name, sale_price, suggested_price,
               wear_float, exterior, pattern, finish, stattrak, image_url, skinport_url, phase)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (tracked_item_id, sale_id) DO NOTHING`,
            [
              trackedItem.id,
              fakeSaleId,
              item.market_hash_name,
              item.min_price || null,
              item.suggested_price || null,
              null, // REST API doesn't provide float
              null, // Will extract from name below
              null,
              null,
              item.market_hash_name ? item.market_hash_name.includes('StatTrak') : false,
              null, // REST API doesn't provide image in same format
              `https://skinport.com/market?search=${encodeURIComponent(item.market_hash_name)}&sort=price&order=asc`,
              null
            ]
          );
          matchCount++;
        } catch (dbErr) {
          if (dbErr.code !== '23505') {
            console.error('Error saving REST match:', dbErr.message);
          }
        }
      }
    }

    if (matchCount > 0) {
      console.log(`✅ Found ${matchCount} existing listing(s) for ${trackedItem.weapon_name} | ${trackedItem.skin_name}`);
    } else {
      console.log(`   No existing listings found for ${trackedItem.weapon_name} | ${trackedItem.skin_name}`);
    }
  } catch (error) {
    console.error('Error checking existing listings:', error.message);
  }
}

/**
 * Check existing listings for ALL active tracked items
 */
async function checkAllExistingListings() {
  console.log('🔍 Scanning existing Skinport listings for all tracked items...');

  try {
    // Clear ALL old matches on startup (fresh start every time)
    await pool.query('DELETE FROM skinport_matches');
    console.log('   Cleared old matches');

    const trackedResult = await pool.query(
      "SELECT * FROM tracked_items WHERE status = 'tracking'"
    );
    const allTracked = trackedResult.rows;

    if (allTracked.length === 0) {
      console.log('   No active tracked items to check');
      return;
    }

    console.log(`   Checking ${allTracked.length} tracked item(s)...`);

    // Force fresh data
    skinportItemsCache = null;
    skinportCacheTime = null;
    const items = await fetchSkinportItemsREST();
    let totalMatches = 0;

    for (const tracked of allTracked) {
      let matchCount = 0;

      for (const item of items) {
        if (doesRESTItemMatch(item, tracked)) {
          const fakeSaleId = -(Date.now() + Math.floor(Math.random() * 100000));

          try {
            await pool.query(
              `INSERT INTO skinport_matches 
                (tracked_item_id, sale_id, market_hash_name, sale_price, suggested_price,
                 wear_float, exterior, pattern, finish, stattrak, image_url, skinport_url, phase)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               ON CONFLICT (tracked_item_id, sale_id) DO NOTHING`,
              [
                tracked.id,
                fakeSaleId,
                item.market_hash_name,
                item.min_price || null,
                item.suggested_price || null,
                null,
                null,
                null,
                null,
                item.market_hash_name ? item.market_hash_name.includes('StatTrak') : false,
                null,
                `https://skinport.com/market?search=${encodeURIComponent(item.market_hash_name)}&sort=price&order=asc`,
                null
              ]
            );
            matchCount++;
          } catch (dbErr) {
            if (dbErr.code !== '23505') {
              console.error('Error saving REST match:', dbErr.message);
            }
          }
        }
      }

      if (matchCount > 0) {
        console.log(`   ✅ ${tracked.weapon_name} | ${tracked.skin_name}: ${matchCount} match(es)`);
        totalMatches += matchCount;
      }
    }

    console.log(`🔍 Initial scan complete: ${totalMatches} total match(es) found`);
  } catch (error) {
    console.error('Error during initial scan:', error.message);
  }
}

// Manual scan endpoint - trigger a full check
app.post('/api/matches/scan', requireAuth, async (req, res) => {
  try {
    // Only scan this user's tracked items
    const trackedResult = await pool.query(
      "SELECT * FROM tracked_items WHERE user_id = $1 AND status = 'tracking'",
      [req.session.userId]
    );

    if (trackedResult.rows.length === 0) {
      // Still clear old matches even if nothing is tracking
      await pool.query(
        `DELETE FROM skinport_matches 
         WHERE tracked_item_id IN (SELECT id FROM tracked_items WHERE user_id = $1)`,
        [req.session.userId]
      );
      return res.json({ message: 'No active tracked items', matches: 0 });
    }

    // Clear ALL old matches for this user's tracked items (fresh start)
    await pool.query(
      `DELETE FROM skinport_matches 
       WHERE tracked_item_id IN (SELECT id FROM tracked_items WHERE user_id = $1)`,
      [req.session.userId]
    );

    let totalMatches = 0;
    // Force fresh data from Skinport REST API (clear cache)
    skinportItemsCache = null;
    skinportCacheTime = null;
    const items = await fetchSkinportItemsREST();

    for (const tracked of trackedResult.rows) {
      for (const item of items) {
        if (doesRESTItemMatch(item, tracked)) {
          const fakeSaleId = -(Date.now() + Math.floor(Math.random() * 100000));

          try {
            await pool.query(
              `INSERT INTO skinport_matches 
                (tracked_item_id, sale_id, market_hash_name, sale_price, suggested_price,
                 wear_float, exterior, pattern, finish, stattrak, image_url, skinport_url, phase)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               ON CONFLICT (tracked_item_id, sale_id) DO NOTHING`,
              [
                tracked.id,
                fakeSaleId,
                item.market_hash_name,
                item.min_price || null,
                item.suggested_price || null,
                null, null, null, null,
                item.market_hash_name ? item.market_hash_name.includes('StatTrak') : false,
                null,
                `https://skinport.com/market?search=${encodeURIComponent(item.market_hash_name)}&sort=price&order=asc`,
                null
              ]
            );
            totalMatches++;
          } catch (dbErr) {
            if (dbErr.code !== '23505') {
              console.error('Error saving scan match:', dbErr.message);
            }
          }
        }
      }
    }

    res.json({ message: `Scan complete`, matches: totalMatches });
  } catch (error) {
    console.error('Error during manual scan:', error);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// ============================================
// Skinport Websocket Integration
// ============================================

let skinportConnected = false;
let lastEventTime = null;
let totalEventsProcessed = 0;

// Doppler finish catalog numbers for phase-specific matching
const DOPPLER_PHASES = {
  418: 'Phase 1',
  419: 'Phase 2',
  420: 'Phase 3',
  421: 'Phase 4',
  415: 'Ruby',
  416: 'Sapphire',
  417: 'Black Pearl',
  568: 'Emerald',
  569: 'Phase 1',  // Gamma Doppler
  570: 'Phase 2',
  571: 'Phase 3',
  572: 'Phase 4',
  573: 'Emerald',
  // Doppler (Butterfly, etc.) use the same finish IDs
};

// Wear condition float ranges
const WEAR_RANGES = {
  'fn': { min: 0, max: 0.07, name: 'Factory New' },
  'mw': { min: 0.07, max: 0.15, name: 'Minimal Wear' },
  'ft': { min: 0.15, max: 0.38, name: 'Field-Tested' },
  'ww': { min: 0.38, max: 0.45, name: 'Well-Worn' },
  'bs': { min: 0.45, max: 1.00, name: 'Battle-Scarred' }
};

/**
 * Check if a Skinport sale listing matches a tracked item's criteria
 */
function doesListingMatch(sale, tracked) {
  // 1. Match weapon name (title in Skinport = weapon name)
  const saleWeapon = (sale.title || '').toLowerCase();
  const saleFamily = (sale.family || sale.name || '').toLowerCase();
  const trackedWeapon = (tracked.weapon_name || '').toLowerCase();
  const trackedSkin = (tracked.skin_name || '').toLowerCase();

  // Check weapon name match
  if (!saleWeapon.includes(trackedWeapon) && !trackedWeapon.includes(saleWeapon)) {
    // Also check marketHashName as fallback
    const marketName = (sale.marketHashName || '').toLowerCase();
    if (!marketName.includes(trackedWeapon)) {
      return false;
    }
  }

  // Check skin name match (handle Doppler phases)
  const skinNameMatch = saleFamily.includes(trackedSkin) || trackedSkin.includes(saleFamily);
  if (!skinNameMatch) {
    // Fallback: check marketHashName
    const marketName = (sale.marketHashName || '').toLowerCase();
    if (!marketName.includes(trackedSkin)) {
      return false;
    }
  }

  // 2. Check price (salePrice is in cents for EUR, convert to USD-ish or compare directly)
  // Skinport prices are in the currency requested (we use USD)
  const salePrice = sale.salePrice / 100; // Convert cents to dollars
  if (tracked.min_price && salePrice < parseFloat(tracked.min_price)) {
    return false;
  }
  if (tracked.max_price && salePrice > parseFloat(tracked.max_price)) {
    return false;
  }

  // 3. Check StatTrak
  if (tracked.stattrak === 'required' && !sale.stattrak) {
    return false;
  }
  if (tracked.stattrak === 'none' && sale.stattrak) {
    return false;
  }

  // 4. Check wear condition
  if (tracked.wear_type === 'preset' && tracked.preset_wear) {
    const wearRange = WEAR_RANGES[tracked.preset_wear];
    if (wearRange && sale.wear !== null && sale.wear !== undefined) {
      if (sale.wear < wearRange.min || sale.wear >= wearRange.max) {
        return false;
      }
    } else if (wearRange) {
      // Check by exterior name if float not available
      const saleExterior = (sale.exterior || '').toLowerCase();
      if (!saleExterior.includes(wearRange.name.toLowerCase())) {
        return false;
      }
    }
  }

  if (tracked.wear_type === 'custom') {
    if (sale.wear !== null && sale.wear !== undefined) {
      if (tracked.min_float && sale.wear < parseFloat(tracked.min_float)) {
        return false;
      }
      if (tracked.max_float && sale.wear > parseFloat(tracked.max_float)) {
        return false;
      }
    }
  }

  // 5. Check pattern number
  if (tracked.pattern_number) {
    if (sale.pattern !== parseInt(tracked.pattern_number)) {
      return false;
    }
  }

  // 6. Check finish catalog (for Doppler phases, Gamma Dopplers, etc.)
  if (tracked.finish_catalog) {
    if (sale.finish !== parseInt(tracked.finish_catalog)) {
      return false;
    }
  }

  return true;
}

/**
 * Process a sale event from the Skinport websocket
 */
async function processSaleEvent(eventType, sales) {
  // Only process new listings
  if (eventType !== 'listed') return;

  try {
    // Get all active tracked items (status = 'tracking') across all users
    const trackedResult = await pool.query(
      "SELECT * FROM tracked_items WHERE status = 'tracking'"
    );
    const allTracked = trackedResult.rows;

    if (allTracked.length === 0) return;

    for (const sale of sales) {
      for (const tracked of allTracked) {
        if (doesListingMatch(sale, tracked)) {
          // Determine phase if it's a Doppler
          const phase = DOPPLER_PHASES[sale.finish] || null;

          // Save match to database
          try {
            await pool.query(
              `INSERT INTO skinport_matches 
                (tracked_item_id, sale_id, market_hash_name, sale_price, suggested_price,
                 wear_float, exterior, pattern, finish, stattrak, image_url, skinport_url, phase)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               ON CONFLICT (tracked_item_id, sale_id) DO UPDATE SET
                 sale_price = $4, found_at = NOW()`,
              [
                tracked.id,
                sale.saleId,
                sale.marketHashName,
                sale.salePrice / 100, // Convert cents to dollars
                sale.suggestedPrice ? sale.suggestedPrice / 100 : null,
                sale.wear,
                sale.exterior,
                sale.pattern,
                sale.finish,
                sale.stattrak || false,
                sale.image ? `https://community.fastly.steamstatic.com/economy/image/${sale.image}` : null,
                sale.url ? `https://skinport.com/item/${sale.url}` : null,
                phase
              ]
            );

            console.log(`✅ MATCH: ${sale.marketHashName} ($${(sale.salePrice/100).toFixed(2)}) → tracked by user ${tracked.user_id}`);
          } catch (dbErr) {
            // Ignore duplicate key errors, log others
            if (dbErr.code !== '23505') {
              console.error('Error saving match:', dbErr.message);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing sale event:', error);
  }
}

/**
 * Connect to Skinport Websocket
 */
async function connectSkinportWebsocket() {
  try {
    // Dynamic imports for ES modules
    const { io } = require('socket.io-client');
    const parser = require('socket.io-msgpack-parser');

    console.log('🔌 Connecting to Skinport websocket...');

    const socket = io('wss://skinport.com', {
      transports: ['websocket'],
      parser,
    });

    socket.on('connect', () => {
      skinportConnected = true;
      console.log('✅ Connected to Skinport websocket');

      // Join sale feed with USD currency
      socket.emit('saleFeedJoin', {
        currency: 'USD',
        locale: 'en',
        appid: 730
      });

      console.log('📡 Joined CS2 sale feed (USD)');
    });

    socket.on('saleFeed', (result) => {
      totalEventsProcessed++;
      lastEventTime = new Date();

      if (result && result.sales && result.sales.length > 0) {
        processSaleEvent(result.eventType, result.sales);
      }
    });

    socket.on('disconnect', (reason) => {
      skinportConnected = false;
      console.log('❌ Disconnected from Skinport:', reason);
    });

    socket.on('connect_error', (error) => {
      skinportConnected = false;
      console.error('❌ Skinport connection error:', error.message);
    });

    // Reconnection handling
    socket.io.on('reconnect', (attempt) => {
      console.log(`🔄 Reconnected to Skinport (attempt ${attempt})`);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`🔄 Reconnecting to Skinport (attempt ${attempt})...`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize Skinport websocket:', error.message);
    console.log('💡 Install required packages: npm install socket.io-client socket.io-msgpack-parser');
  }
}

// ============================================
// Auto-Cleanup & Refresh
// ============================================

async function cleanupOldMatches() {
  try {
    const result = await pool.query(
      "DELETE FROM skinport_matches WHERE found_at < NOW() - INTERVAL '24 hours' RETURNING id"
    );
    if (result.rows.length > 0) {
      console.log(`🧹 Cleaned up ${result.rows.length} old match(es)`);
    }
  } catch (error) {
    console.error('Error cleaning up matches:', error.message);
  }
}

// Clean up old matches every hour
setInterval(cleanupOldMatches, 60 * 60 * 1000);

// Re-scan existing listings every 15 minutes to keep prices fresh
setInterval(async () => {
  // Clear old matches first
  await cleanupOldMatches();
  // Then re-scan
  await checkAllExistingListings();
}, 15 * 60 * 1000);

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Clean old matches on startup, then every hour
  async function cleanOldMatches() {
    try {
      const result = await pool.query(
        "DELETE FROM skinport_matches WHERE found_at < NOW() - INTERVAL '24 hours' RETURNING id"
      );
      if (result.rows.length > 0) {
        console.log(`🧹 Cleaned ${result.rows.length} old match(es)`);
      }
    } catch (err) {
      console.error('Error cleaning old matches:', err.message);
    }
  }

  cleanOldMatches();
  setInterval(cleanOldMatches, 60 * 60 * 1000); // Every hour

  // Clean up old matches on startup
  pool.query("DELETE FROM skinport_matches WHERE found_at < NOW() - INTERVAL '24 hours'")
    .then(result => {
      if (result.rowCount > 0) {
        console.log(`🧹 Cleaned up ${result.rowCount} stale match(es)`);
      }
    })
    .catch(err => console.error('Cleanup error:', err.message));

  // Auto-cleanup every hour
  setInterval(async () => {
    try {
      const result = await pool.query("DELETE FROM skinport_matches WHERE found_at < NOW() - INTERVAL '24 hours'");
      if (result.rowCount > 0) {
        console.log(`🧹 Auto-cleanup: removed ${result.rowCount} stale match(es)`);
      }
    } catch (err) {
      console.error('Auto-cleanup error:', err.message);
    }
  }, 60 * 60 * 1000); // Every hour

  // Clean old matches on startup
  pool.query("DELETE FROM skinport_matches WHERE found_at < NOW() - INTERVAL '24 hours'")
    .then(res => {
      if (res.rowCount > 0) console.log(`🧹 Cleaned ${res.rowCount} old match(es)`);
    })
    .catch(err => console.error('Cleanup error:', err.message));

  // Auto-clean old matches every hour
  setInterval(() => {
    pool.query("DELETE FROM skinport_matches WHERE found_at < NOW() - INTERVAL '24 hours'")
      .then(res => {
        if (res.rowCount > 0) console.log(`🧹 Auto-cleaned ${res.rowCount} old match(es)`);
      })
      .catch(err => console.error('Auto-cleanup error:', err.message));
  }, 60 * 60 * 1000); // Every hour

  // Connect to Skinport websocket for real-time new listings
  connectSkinportWebsocket();

  // Clean old matches, then check existing listings (after short delay)
  setTimeout(async () => {
    await cleanupOldMatches();
    await checkAllExistingListings();
  }, 3000);
});