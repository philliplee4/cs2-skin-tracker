require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const https = require('https');
const zlib = require('zlib');
const pool = require('./db');

const app = express();
const PORT = 3001;

// Middleware
app.use(helmet({
  // We're running an API that's called from a separate frontend on :5500,
  // so the default strict CSP/CORP headers would break things.
  // Keep the rest (hsts, xss, noSniff, frameguard, etc.)
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));
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
// Rate Limiters
// ============================================

// Login / register: protect against brute-force and spam signup.
// Counts FAILED attempts more strictly — 10 total per 15 min per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' }
});

// Manual scan is expensive (hits Skinport + DB hard). Cap it.
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Scanning too frequently. Wait a moment and try again.' }
});

// Generic API limiter for anything that hits the DB.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

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
app.post('/api/register', authLimiter, async (req, res) => {
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
app.post('/api/login', authLimiter, async (req, res) => {
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
    stattrak, souvenir, pattern_number, finish_catalog, notes
  } = req.body;

  if (!skin_id || !weapon_name || !skin_name) {
    return res.status(400).json({ error: 'skin_id, weapon_name, and skin_name are required' });
  }

  try {
    // Check for duplicate — same skin with same key criteria
    const duplicate = await pool.query(
      `SELECT id FROM tracked_items
       WHERE user_id = $1 AND skin_id = $2
         AND min_price IS NOT DISTINCT FROM $3
         AND max_price IS NOT DISTINCT FROM $4
         AND wear_type IS NOT DISTINCT FROM $5
         AND preset_wear IS NOT DISTINCT FROM $6
         AND stattrak IS NOT DISTINCT FROM $7
         AND finish_catalog IS NOT DISTINCT FROM $8
         AND souvenir IS NOT DISTINCT FROM $9
         AND status != 'cancelled'`,
      [req.session.userId, skin_id, min_price || null, max_price || null,
       wear_type || 'any', preset_wear || null, stattrak || 'any', finish_catalog || null,
       souvenir || 'any']
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: 'You are already tracking this item with the same criteria' });
    }

    const result = await pool.query(
      `INSERT INTO tracked_items
        (user_id, skin_id, weapon_name, skin_name, image_url, rarity, category,
         min_price, max_price, wear_type, preset_wear, min_float, max_float,
         stattrak, souvenir, pattern_number, finish_catalog, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [req.session.userId, skin_id, weapon_name, skin_name, image_url, rarity, category,
       min_price || null, max_price || null, wear_type || 'any', preset_wear || null,
       min_float || null, max_float || null, stattrak || 'any', souvenir || 'any',
       pattern_number || null, finish_catalog || null, notes || null]
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
    stattrak, souvenir, pattern_number, finish_catalog, notes, status
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
        notes = $9, status = $10, finish_catalog = $11, souvenir = $12, updated_at = NOW()
       WHERE id = $13 AND user_id = $14
       RETURNING *`,
      [min_price || null, max_price || null, wear_type || 'any', preset_wear || null,
       min_float || null, max_float || null, stattrak || 'any', pattern_number || null,
       notes || null, status || 'tracking', finish_catalog || null, souvenir || 'any',
       id, req.session.userId]
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
let skinportErrorTime = null; // tracks last rate-limit / bad-response time for backoff
const SKINPORT_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const SKINPORT_BACKOFF_DURATION = 2 * 60 * 1000; // 2 minutes

/**
 * Fetch all items from Skinport REST API (with caching and error backoff).
 * Uses https.request so we can attach a browser-like User-Agent — without it
 * Skinport aggressively rate-limits or ignores server-side requests.
 */
function fetchSkinportItemsREST() {
  return new Promise((resolve, reject) => {
    const now = Date.now();

    // Return cache if still fresh
    if (skinportItemsCache && skinportCacheTime && (now - skinportCacheTime < SKINPORT_CACHE_DURATION)) {
      return resolve(skinportItemsCache);
    }

    // Don't hammer Skinport while we're in a backoff window
    if (skinportErrorTime && (now - skinportErrorTime < SKINPORT_BACKOFF_DURATION)) {
      return reject(new Error('[Skinport REST] On backoff — skipping'));
    }

    const options = {
      hostname: 'api.skinport.com',
      path: '/v1/items?app_id=730&currency=USD',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'br, gzip, deflate',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 429) {
        skinportErrorTime = Date.now();
        console.log('[Skinport REST] Rate limited — backing off 2 min');
        res.resume(); // drain the socket so the connection closes cleanly
        return reject(new Error('[Skinport REST] Rate limited (429)'));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer   = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];

        const handleData = (data) => {
          try {
            const parsed = JSON.parse(data);
            // Skinport returns a plain array, but guard against wrapped formats
            let items;
            if (Array.isArray(parsed))                       items = parsed;
            else if (parsed && Array.isArray(parsed.data))   items = parsed.data;
            else if (parsed && Array.isArray(parsed.items))  items = parsed.items;
            else {
              skinportErrorTime = Date.now();
              console.log('[Skinport REST] Unexpected response format — backing off');
              return reject(new Error('Skinport REST: unexpected response format'));
            }
            skinportItemsCache = items;
            skinportCacheTime  = Date.now();
            skinportErrorTime  = null;
            console.log(`[Skinport REST] Cached ${items.length} items`);
            resolve(items);
          } catch (e) {
            skinportErrorTime = Date.now();
            reject(new Error('Failed to parse Skinport REST response'));
          }
        };

        if (encoding === 'br') {
          zlib.brotliDecompress(buffer, (err, result) => {
            if (err) { skinportErrorTime = Date.now(); return reject(err); }
            handleData(result.toString());
          });
        } else if (encoding === 'gzip') {
          zlib.gunzip(buffer, (err, result) => {
            if (err) { skinportErrorTime = Date.now(); return reject(err); }
            handleData(result.toString());
          });
        } else {
          handleData(buffer.toString());
        }
      });
    });

    req.on('error', (err) => { skinportErrorTime = Date.now(); reject(err); });
    req.setTimeout(15000, () => {
      req.destroy();
      skinportErrorTime = Date.now();
      reject(new Error('Skinport REST request timed out'));
    });
    req.end();
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

  // Check Souvenir
  if (tracked.souvenir === 'required' && !itemName.includes('souvenir')) {
    return false;
  }
  if (tracked.souvenir === 'none' && itemName.includes('souvenir')) {
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

  // Custom float range — determine which wear tiers overlap and filter by name
  if (tracked.wear_type === 'custom' && (tracked.min_float !== null || tracked.max_float !== null)) {
    const minF = tracked.min_float ? parseFloat(tracked.min_float) : 0;
    const maxF = tracked.max_float ? parseFloat(tracked.max_float) : 1;

    // Find which wear tiers overlap with the custom range
    const matchingWears = [];
    for (const [key, range] of Object.entries(WEAR_RANGES)) {
      // Check if ranges overlap: custom [minF, maxF] overlaps with tier [range.min, range.max]
      if (minF < range.max && maxF > range.min) {
        matchingWears.push(range.name.toLowerCase());
      }
    }

    // If we found matching tiers, check if item name contains any of them
    if (matchingWears.length > 0) {
      const itemMatchesAnyWear = matchingWears.some(wear => itemName.includes(wear));
      if (!itemMatchesAnyWear) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check existing Skinport listings for a single tracked item.
 * Called when a user adds a new tracked item — sends one Discord notification
 * if matches are found so the user knows immediately without having to check the site.
 */
async function checkExistingListingsForItem(trackedItem) {
  if (trackedItem.status !== 'tracking') return;

  console.log(`🔍 Checking existing Skinport listings for: ${trackedItem.weapon_name} | ${trackedItem.skin_name}`);

  try {
    const items = await fetchSkinportItemsREST();
    const matchedItems = []; // collect matches for notification

    for (const item of items) {
      if (doesRESTItemMatch(item, trackedItem)) {
        const fakeSaleId = -(Date.now() + Math.floor(Math.random() * 10000));

        try {
          const result = await pool.query(
            `INSERT INTO skinport_matches
              (tracked_item_id, sale_id, market_hash_name, sale_price, suggested_price,
               wear_float, exterior, pattern, finish, stattrak, image_url, skinport_url, phase)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (tracked_item_id, sale_id) DO NOTHING
             RETURNING id`,
            [
              trackedItem.id,
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

          // Only count genuinely new rows
          if (result.rows.length > 0) {
            matchedItems.push(item);
          }
        } catch (dbErr) {
          if (dbErr.code !== '23505') {
            console.error('Error saving REST match:', dbErr.message);
          }
        }
      }
    }

    if (matchedItems.length > 0) {
      console.log(`✅ Found ${matchedItems.length} existing listing(s) for ${trackedItem.weapon_name} | ${trackedItem.skin_name}`);

      // Send one Discord notification with all matches sorted cheapest first
      const sorted = matchedItems
        .filter(m => m.min_price != null)
        .sort((a, b) => a.min_price - b.min_price);

      notifyUserOfRESTMatches(trackedItem.user_id, trackedItem, sorted).catch(err => {
        console.error('REST match notification error:', err.message);
      });
    } else {
      console.log(`   No existing listings found for ${trackedItem.weapon_name} | ${trackedItem.skin_name}`);
    }
  } catch (error) {
    console.error('Error checking existing listings:', error.message);
  }

  // Also check DMarket for this item (async, don't block)
  checkDMarketListingsForItem(trackedItem).catch(err => {
    console.error('DMarket check error for new item:', err.message);
  });
}

/**
 * Send a Discord notification for existing Skinport REST listings found
 * when a user first adds a tracked item.
 */
async function notifyUserOfRESTMatches(userId, trackedItem, matches) {
  try {
    const settings = await pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1 AND enabled = true',
      [userId]
    );

    if (settings.rows.length === 0) return;

    const itemName = `${trackedItem.weapon_name} | ${trackedItem.skin_name}`;

    const fields = matches.slice(0, 10).map((match, i) => {
      const price = match.min_price != null ? `$${match.min_price.toFixed(2)}` : 'N/A';
      const suggested = match.suggested_price != null ? `$${match.suggested_price.toFixed(2)}` : null;
      const url = `https://skinport.com/market?search=${encodeURIComponent(match.market_hash_name)}&sort=price&order=asc`;

      return {
        name: `${i + 1}. ${match.market_hash_name} — ${price}`,
        value: `${suggested ? `Suggested: ${suggested}\n` : ''}[View on Skinport](${url})`,
        inline: false
      };
    });

    const embed = {
      title: `🎯 ${matches.length} existing listing${matches.length === 1 ? '' : 's'} found for ${itemName}`,
      description: `These listings are already on Skinport and match your criteria.${matches.length > 10 ? `\n\n*Showing top 10 of ${matches.length}. Check your profile for all results.*` : ''}`,
      color: 0x4ecdc4,
      fields,
      footer: { text: 'CS2 Skin Tracker — Skinport' },
      timestamp: new Date().toISOString()
    };

    if (trackedItem.min_price || trackedItem.max_price) {
      const range = trackedItem.min_price && trackedItem.max_price
        ? `$${trackedItem.min_price} - $${trackedItem.max_price}`
        : trackedItem.min_price ? `From $${trackedItem.min_price}` : `Up to $${trackedItem.max_price}`;
      embed.description = `Target price range: ${range}\n\n` + embed.description;
    }

    for (const setting of settings.rows) {
      if (setting.method === 'discord') {
        await sendDiscordNotification(setting.value, embed).catch(err => {
          console.error(`REST notification Discord error for user ${userId}:`, err.message);
        });
      }
    }
  } catch (err) {
    console.error('Error sending REST match notifications:', err.message);
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
    // DMarket scan is handled separately at startup with a longer delay
  } catch (error) {
    console.error('Error during initial scan:', error.message);
  }
}

// Manual scan endpoint - trigger a full check
app.post('/api/matches/scan', requireAuth, scanLimiter, async (req, res) => {
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

    // Also kick off a DMarket scan in the background (non-blocking so response returns quickly)
    checkAllDMarketListings().catch(err => {
      console.error('Manual DMarket scan error:', err.message);
    });

    res.json({ message: `Scan complete`, matches: totalMatches });
  } catch (error) {
    console.error('Error during manual scan:', error);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// ============================================
// Notification Settings Routes
// ============================================

// Get notification settings for current user
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1',
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add or update a notification method
app.post('/api/notifications', requireAuth, async (req, res) => {
  const { method, value, enabled } = req.body;

  if (!method || !value) {
    return res.status(400).json({ error: 'Method and value are required' });
  }

  if (!['discord', 'email', 'phone'].includes(method)) {
    return res.status(400).json({ error: 'Invalid notification method' });
  }

  try {
    // Upsert — update if method exists, insert if not
    const result = await pool.query(
      `INSERT INTO notification_settings (user_id, method, value, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, method) DO UPDATE SET
         value = $3, enabled = $4, updated_at = NOW()
       RETURNING *`,
      [req.session.userId, method, value, enabled !== false]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving notification setting:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a notification method
app.delete('/api/notifications/:method', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM notification_settings WHERE user_id = $1 AND method = $2 RETURNING *',
      [req.session.userId, req.params.method]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification method not found' });
    }

    res.json({ message: 'Notification method removed' });
  } catch (error) {
    console.error('Error deleting notification setting:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test a notification method
app.post('/api/notifications/test', requireAuth, async (req, res) => {
  const { method } = req.body;

  try {
    const setting = await pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1 AND method = $2',
      [req.session.userId, method]
    );

    if (setting.rows.length === 0) {
      return res.status(404).json({ error: 'Notification method not configured' });
    }

    const config = setting.rows[0];

    if (method === 'discord') {
      await sendDiscordNotification(config.value, {
        title: '🔔 Test Notification',
        description: 'Your Discord notifications are working! You\'ll receive alerts here when tracked items are found on Skinport.',
        color: 0x4ecdc4,
        fields: [
          { name: 'Status', value: '✅ Connected', inline: true },
          { name: 'User', value: req.session.username, inline: true }
        ]
      });
      res.json({ message: 'Test notification sent!' });
    } else {
      res.status(400).json({ error: `${method} notifications not yet implemented` });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification. Check your webhook URL.' });
  }
});

// ============================================
// Discord Webhook Functions
// ============================================

/**
 * Send a Discord webhook notification
 */
async function sendDiscordNotification(webhookUrl, embed) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      username: 'CS2 Skin Tracker',
      avatar_url: 'https://raw.githubusercontent.com/nickarino/cs2-tracker/main/icon.png',
      embeds: [embed]
    });

    const url = new URL(webhookUrl);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Discord webhook failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send match notifications to a user via all their enabled methods
 */
async function notifyUserOfMatches(userId, trackedItem, matches) {
  try {
    // Get user's notification settings
    const settings = await pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1 AND enabled = true',
      [userId]
    );

    if (settings.rows.length === 0) return;

    for (const setting of settings.rows) {
      if (setting.method === 'discord') {
        try {
          await sendMatchDiscordNotification(setting.value, trackedItem, matches);
        } catch (err) {
          console.error(`❌ Discord notification failed for user ${userId}:`, err.message);
        }
      }
      // Future: email, phone
    }
  } catch (error) {
    console.error('Error sending notifications:', error);
  }
}

/**
 * Format and send match results to Discord
 */
async function sendMatchDiscordNotification(webhookUrl, trackedItem, matches) {
  const itemName = `${trackedItem.weapon_name} | ${trackedItem.skin_name}`;

  // Build fields for each match (max 25 per embed)
  const fields = matches.slice(0, 10).map((match, i) => {
    const price = match.salePrice ? `$${(match.salePrice / 100).toFixed(2)}` : 'N/A';
    const wear = match.exterior || 'Unknown';
    const floatVal = match.wear != null ? parseFloat(match.wear).toFixed(4) : '';
    const phase = DOPPLER_PHASES[match.finish] ? ` (${DOPPLER_PHASES[match.finish]})` : '';
    const stattrak = match.stattrak ? ' StatTrak™' : '';
    // Build URL from slug if available, fall back to search URL
    const url = match.url
      ? `https://skinport.com/item/${match.url}`
      : `https://skinport.com/market?search=${encodeURIComponent(itemName)}&sort=price&order=asc`;

    return {
      name: `${i + 1}. ${wear}${phase}${stattrak} — ${price}`,
      value: `${floatVal ? `Float: ${floatVal}\n` : ''}[View on Skinport](${url})`,
      inline: false
    };
  });

  const embed = {
    title: `🎯 Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for ${itemName}`,
    color: 0x4ecdc4, // Teal color matching your site
    fields: fields,
    footer: {
      text: 'CS2 Skin Tracker — Skinport Live Feed'
    },
    timestamp: new Date().toISOString()
  };

  // Add price range info
  if (trackedItem.min_price || trackedItem.max_price) {
    const range = trackedItem.min_price && trackedItem.max_price
      ? `$${trackedItem.min_price} - $${trackedItem.max_price}`
      : trackedItem.min_price ? `From $${trackedItem.min_price}` : `Up to $${trackedItem.max_price}`;
    embed.description = `Target price range: ${range}`;
  }

  if (matches.length > 10) {
    embed.description = (embed.description || '') + `\n\n*Showing top 10 of ${matches.length} matches. Check your profile for all results.*`;
  }

  await sendDiscordNotification(webhookUrl, embed);
}

// ============================================
// Multi-Market Price Comparison
// ============================================

// Per-source caches so we never hammer external APIs
const dmarketCache = new Map(); // key: searchTitle   → { data, timestamp }
const steamCache   = new Map(); // key: marketHashName → { data, timestamp }
const DMARKET_CACHE_TTL = 10 * 60 * 1000;    // 10 minutes
const STEAM_CACHE_TTL   =  6 * 60 * 60 * 1000; // 6 hours (Steam prices are slow-moving)

/**
 * Fetch the lowest listed price for a skin on DMarket.
 * DMarket's public REST API requires no auth for read-only item listings.
 * Prices come back in USD cents as a string inside price.USD.
 */
function fetchDMarketPrice(searchTitle) {
  return new Promise((resolve) => {
    const now    = Date.now();
    const cached = dmarketCache.get(searchTitle);
    if (cached && (now - cached.timestamp) < DMARKET_CACHE_TTL) {
      return resolve(cached.data);
    }

    const encodedTitle = encodeURIComponent(searchTitle);
    const path = `/exchange/v1/market/items?gameId=a8db&title=${encodedTitle}&currency=USD&limit=10&orderBy=price&orderDir=asc`;

    const options = {
      hostname: 'api.dmarket.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CS2Tracker/1.0)',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.objects && json.objects.length > 0) {
            const prices = json.objects
              .map(obj => obj.price && obj.price.USD ? parseInt(obj.price.USD, 10) : null)
              .filter(p => p !== null && p > 0);

            if (prices.length > 0) {
              const result = {
                price: Math.min(...prices) / 100,
                count: prices.length
              };
              dmarketCache.set(searchTitle, { data: result, timestamp: now });
              return resolve(result);
            }
          }
          resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Fetch the lowest and median price from Steam Community Market.
 * Steam requires an exact market_hash_name including wear tier.
 * We use Field-Tested as the representative condition (most commonly traded).
 * Steam prices include their ~15% seller fee — we note this in the UI.
 */
function fetchSteamPrice(marketHashName) {
  return new Promise((resolve) => {
    const now    = Date.now();
    const cached = steamCache.get(marketHashName);
    if (cached && (now - cached.timestamp) < STEAM_CACHE_TTL) {
      return resolve(cached.data);
    }

    const encodedName = encodeURIComponent(marketHashName);
    const options = {
      hostname: 'steamcommunity.com',
      path: `/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodedName}`,
      method: 'GET',
      headers: {
        // Without a real browser UA Steam silently returns 400 or nothing
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.success && json.lowest_price) {
            // "$1.23" or "1,23€" → strip everything except digits and the dot
            const toFloat = str => parseFloat(str.replace(/[^0-9.]/g, ''));
            const result = {
              price:  toFloat(json.lowest_price),
              median: json.median_price ? toFloat(json.median_price) : null,
              volume: json.volume || null
            };
            steamCache.set(marketHashName, { data: result, timestamp: now });
            return resolve(result);
          }
          resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * GET /api/market-prices?weapon=AK-47&skin=Redline
 *
 * Returns lowest prices from Skinport (cached REST data), DMarket, and Steam (FT).
 * Each source is independent — if one fails the others still return.
 */
app.get('/api/market-prices', async (req, res) => {
  const { weapon, skin } = req.query;
  if (!weapon || !skin) {
    return res.status(400).json({ error: 'weapon and skin query params are required' });
  }

  const searchName = `${weapon} | ${skin}`;
  const ftHashName = `${searchName} (Field-Tested)`;

  // Skinport: scan the existing in-memory REST cache (no extra network call needed)
  let skinportResult = null;
  try {
    const items = await fetchSkinportItemsREST();
    const wLower = weapon.toLowerCase();
    const sLower = skin.toLowerCase();
    const matches = items.filter(item => {
      const n = (item.market_hash_name || '').toLowerCase();
      return n.includes(wLower) && n.includes(sLower);
    });
    if (matches.length > 0) {
      const prices = matches.map(m => m.min_price).filter(p => p != null && p > 0);
      if (prices.length > 0) {
        skinportResult = {
          price: Math.min(...prices),
          count: matches.length,
          url: `https://skinport.com/market?search=${encodeURIComponent(searchName)}&sort=price&order=asc`
        };
      }
    }
  } catch (_) { /* Skinport unavailable — continue with other sources */ }

  // DMarket and Steam fetched in parallel to keep response latency low
  const [dmarketRaw, steamRaw] = await Promise.all([
    fetchDMarketPrice(searchName).catch(() => null),
    fetchSteamPrice(ftHashName).catch(() => null)
  ]);

  const dmarketResult = dmarketRaw ? {
    ...dmarketRaw,
    url: `https://dmarket.com/ingame-items/item-list/csgo-skins?userOffersSearch=${encodeURIComponent(searchName)}`
  } : null;

  const steamResult = steamRaw ? {
    ...steamRaw,
    condition: 'Field-Tested',
    note: 'Incl. Steam 15% fee',
    url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(ftHashName)}`
  } : null;

  res.json({
    searchName,
    fetchedAt: new Date().toISOString(),
    skinport: skinportResult,
    dmarket:  dmarketResult,
    steam:    steamResult
  });
});

// ============================================
// Skinport Price History
// ============================================

const skinportHistoryCache = new Map();
const SKINPORT_HISTORY_CACHE_TTL        = 30 * 60 * 1000; // 30 minutes (price history is slow-moving)
const SKINPORT_HISTORY_BACKOFF_DURATION = 10 * 60 * 1000; // 10 minutes after a 429
let skinportHistoryErrorTime = null; // backoff after 429 from history API

// Field-Tested first — most commonly listed condition for the majority of skins.
// Trying in popularity order lets us stop early and save API quota.
const WEAR_SUFFIXES = [
  '(Field-Tested)',
  '(Minimal Wear)',
  '(Factory New)',
  '(Well-Worn)',
  '(Battle-Scarred)'
];

const TIME_WINDOWS = [
  { label: '90d', key: 'last_90_days'  },
  { label: '30d', key: 'last_30_days'  },
  { label: '7d',  key: 'last_7_days'   },
  { label: '24h', key: 'last_24_hours' }
];

/**
 * Fetch aggregated sales history from Skinport for a given weapon + skin.
 *
 * Fetches wear conditions one at a time (not in parallel) so we don't burst
 * all 5 requests at once and immediately hit Skinport's rate limit.
 * Stops as soon as a wear tier with >= 5 sales in the last 30 days is found,
 * which is usually just the first request (Field-Tested) for popular skins.
 */
async function fetchSkinportSalesHistory(weaponName, skinName) {
  const cacheKey = `${weaponName}|${skinName}`;
  const now = Date.now();

  const cached = skinportHistoryCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < SKINPORT_HISTORY_CACHE_TTL) {
    return cached.data;
  }

  // Honour backoff if we recently got rate-limited
  if (skinportHistoryErrorTime && (now - skinportHistoryErrorTime < SKINPORT_HISTORY_BACKOFF_DURATION)) {
    return { rateLimited: true };
  }

  const baseName = `${weaponName} | ${skinName}`;

  const fetchWear = (suffix) => new Promise((res) => {
    const marketHashName = `${baseName} ${suffix}`;
    const encodedName    = encodeURIComponent(marketHashName);
    const options = {
      hostname: 'api.skinport.com',
      path: `/v1/sales/history?app_id=730&currency=USD&market_hash_name=${encodedName}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'br, gzip, deflate',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    };

    const req = https.request(options, (response) => {
      if (response.statusCode === 429) {
        skinportHistoryErrorTime = Date.now();
        console.log('[Skinport History] Rate limited — backing off');
        response.resume();
        return res({ wear: suffix, item: null });
      }

      let stream = response;
      const enc = response.headers['content-encoding'];
      if (enc === 'br')        stream = response.pipe(zlib.createBrotliDecompress());
      else if (enc === 'gzip') stream = response.pipe(zlib.createGunzip());

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        try {
          const raw  = Buffer.concat(chunks).toString();
          const json = JSON.parse(raw);
          let item = null;
          if (Array.isArray(json)) {
            item = json.find(i => i.market_hash_name === marketHashName) ?? json[0] ?? null;
          } else if (typeof json === 'object' && json !== null) {
            item = json;
          }
          if (item && (item['last_90_days'] || item['last_30_days'] || item['last_7_days'] || item['last_24_hours'])) {
            res({ wear: suffix, item });
          } else {
            res({ wear: suffix, item: null });
          }
        } catch (_) {
          res({ wear: suffix, item: null });
        }
      });
      stream.on('error', () => res({ wear: suffix, item: null }));
    });

    req.on('error', () => res({ wear: suffix, item: null }));
    req.setTimeout(8000, () => { req.destroy(); res({ wear: suffix, item: null }); });
    req.end();
  });

  // Sequential fetch — one wear condition at a time with a pause between each.
  // This keeps us well under Skinport's rate limit even with many concurrent users.
  const results = [];
  for (let i = 0; i < WEAR_SUFFIXES.length; i++) {
    // Stop immediately if a previous request triggered the backoff
    if (skinportHistoryErrorTime && (Date.now() - skinportHistoryErrorTime < SKINPORT_HISTORY_BACKOFF_DURATION)) break;

    const result = await fetchWear(WEAR_SUFFIXES[i]);
    results.push(result);

    // Early exit: this wear tier has any 30-day data — no need to check others
    if (result.item) {
      const vol30 = result.item['last_30_days']?.volume ?? 0;
      if (vol30 >= 1) break;
    }

    // Pause before the next request
    if (i < WEAR_SUFFIXES.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Pick the wear tier with the highest 30d (or fallback 7d / 90d) volume
  let best = null;
  let bestVol = -1;
  for (const { wear, item } of results) {
    if (!item) continue;
    const vol = (item['last_30_days']?.volume ?? item['last_7_days']?.volume ?? item['last_90_days']?.volume ?? 0);
    if (vol > bestVol) { bestVol = vol; best = { wear, item }; }
  }

  // Fallback: any result that has data at all
  if (!best) {
    const fallback = results.find(r => r.item != null);
    if (fallback) best = { wear: fallback.wear, item: fallback.item };
  }

  if (!best) {
    skinportHistoryCache.set(cacheKey, { data: null, timestamp: now });
    return null;
  }

  const { wear, item } = best;

  // Only include time windows that have at least one real value
  const points = TIME_WINDOWS
    .map(({ label, key }) => ({
      label,
      min:    item[key]?.min    ?? null,
      median: item[key]?.median ?? null,
      volume: item[key]?.volume ?? 0
    }))
    .filter(p => p.median != null || p.min != null);

  const result = { wear, points };
  skinportHistoryCache.set(cacheKey, { data: result, timestamp: now });
  skinportHistoryErrorTime = null; // clear backoff on success
  return result;
}

/**
 * GET /api/price-history?weapon=AK-47&skin=Redline
 *
 * Returns Skinport aggregated sales history across all wear tiers.
 * Picks the wear with highest 30d volume and returns only buckets with real data.
 * Falls back to Steam spot price if Skinport has no history.
 */
app.get('/api/price-history', apiLimiter, async (req, res) => {
  const { weapon, skin } = req.query;
  if (!weapon || !skin) {
    return res.status(400).json({ error: 'weapon and skin query params required' });
  }
  try {
    const history = await fetchSkinportSalesHistory(weapon, skin);

    // Rate limited — tell the frontend so it can show a useful message
    if (history && history.rateLimited) {
      return res.json({ fetchedAt: new Date().toISOString(), history: null, rateLimited: true });
    }

    // Skinport has data — return it
    if (history && history.points && history.points.length > 0) {
      return res.json({ fetchedAt: new Date().toISOString(), history });
    }

    // No Skinport history — try Steam as a fallback (gives us a single spot price point)
    const ftHashName = `${weapon} | ${skin} (Field-Tested)`;
    const steamRaw = await fetchSteamPrice(ftHashName).catch(() => null);

    if (steamRaw && steamRaw.price) {
      // Synthesise a minimal "chart" from Steam's current price so the graph isn't blank
      const syntheticHistory = {
        wear: '(Field-Tested)',
        source: 'steam',
        points: [{ label: 'Current', min: steamRaw.price, median: steamRaw.median || steamRaw.price, volume: 0 }]
      };
      return res.json({ fetchedAt: new Date().toISOString(), history: syntheticHistory });
    }

    // Truly no data anywhere
    res.json({ fetchedAt: new Date().toISOString(), history: null });
  } catch (err) {
    console.error('Price history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch price history' });
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

  // 3b. Check Souvenir
  if (tracked.souvenir === 'required' && !sale.souvenir) {
    return false;
  }
  if (tracked.souvenir === 'none' && sale.souvenir) {
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
  if (eventType === 'sold') {
    // Remove sold listings from matches
    for (const sale of sales) {
      try {
        const deleted = await pool.query(
          'DELETE FROM skinport_matches WHERE sale_id = $1 RETURNING tracked_item_id',
          [sale.saleId]
        );

        if (deleted.rows.length > 0) {
          console.log(`🔴 SOLD: ${sale.marketHashName} ($${(sale.salePrice/100).toFixed(2)}) — removed from matches`);

          // Check if tracked item has any remaining matches
          for (const row of deleted.rows) {
            const remaining = await pool.query(
              'SELECT COUNT(*) FROM skinport_matches WHERE tracked_item_id = $1',
              [row.tracked_item_id]
            );

            if (parseInt(remaining.rows[0].count) === 0) {
              // No more matches — set status back to tracking
              await pool.query(
                "UPDATE tracked_items SET status = 'tracking', updated_at = NOW() WHERE id = $1 AND status = 'found'",
                [row.tracked_item_id]
              );
              console.log(`   ↩ Tracked item ${row.tracked_item_id} set back to TRACKING (no matches left)`);
            }
          }
        }
      } catch (err) {
        console.error('Error processing sold event:', err.message);
      }
    }
    return;
  }

  // Only process new listings
  if (eventType !== 'listed') return;

  try {
    // Get all active tracked items (status = 'tracking') across all users
    const trackedResult = await pool.query(
      "SELECT * FROM tracked_items WHERE status = 'tracking'"
    );
    const allTracked = trackedResult.rows;

    if (allTracked.length === 0) return;

    // Track matches per user per tracked item for batched notifications
    // Key: `${user_id}_${tracked_item_id}`, Value: { tracked, matches: [sale, ...] }
    const matchBatches = {};

    for (const sale of sales) {
      for (const tracked of allTracked) {
        if (doesListingMatch(sale, tracked)) {
          // Determine phase if it's a Doppler
          const phase = DOPPLER_PHASES[sale.finish] || null;

          // Save match to database — only notify if this is a genuinely new match
          try {
            const insertResult = await pool.query(
              `INSERT INTO skinport_matches
                (tracked_item_id, sale_id, market_hash_name, sale_price, suggested_price,
                 wear_float, exterior, pattern, finish, stattrak, image_url, skinport_url, phase)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               ON CONFLICT (tracked_item_id, sale_id) DO NOTHING`,
              [
                tracked.id,
                sale.saleId,
                sale.marketHashName,
                sale.salePrice / 100,
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

            // rowCount === 0 means it already existed — skip notification
            if (insertResult.rowCount === 0) continue;

            console.log(`✅ MATCH: ${sale.marketHashName} ($${(sale.salePrice/100).toFixed(2)}) → tracked by user ${tracked.user_id}`);

            // Batch for notification — only for genuinely new matches
            const batchKey = `${tracked.user_id}_${tracked.id}`;
            if (!matchBatches[batchKey]) {
              matchBatches[batchKey] = { tracked, matches: [] };
            }
            matchBatches[batchKey].matches.push(sale);

          } catch (dbErr) {
            if (dbErr.code !== '23505') {
              console.error('Error saving match:', dbErr.message);
            }
          }
        }
      }
    }

    // Send batched notifications
    for (const batch of Object.values(matchBatches)) {
      notifyUserOfMatches(batch.tracked.user_id, batch.tracked, batch.matches).catch(err => {
        console.error('Notification error:', err.message);
      });
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
// DMarket Listing Tracker
// ============================================

/**
 * Fetch all current listings for a skin from DMarket's public REST API.
 * Returns normalized listing objects ready for criteria matching.
 * DMarket returns per-listing float values and pattern seeds, making it
 * suitable for full criteria tracking (unlike Skinport REST which omits floats).
 */
function fetchDMarketListings(weaponName, skinName) {
  return new Promise((resolve) => {
    const title = `${weaponName} | ${skinName}`;
    const encodedTitle = encodeURIComponent(title);
    const path = `/exchange/v1/market/items?gameId=a8db&title=${encodedTitle}&currency=USD&limit=100&orderBy=price&orderDir=asc`;

    const options = {
      hostname: 'api.dmarket.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CS2Tracker/1.0)',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (!json.objects || !Array.isArray(json.objects)) return resolve([]);

          const listings = json.objects.map(obj => {
            const itemTitle = obj.title || '';

            // Wear condition is in the title parenthetical: "AK-47 | Redline (Field-Tested)"
            const wearMatch = itemTitle.match(/\(([^)]+)\)$/);
            const exterior = wearMatch ? wearMatch[1] : null;

            const price = obj.price && obj.price.USD
              ? parseInt(obj.price.USD, 10) / 100 : null;
            const suggestedPrice = obj.suggestPrice && obj.suggestPrice.USD
              ? parseInt(obj.suggestPrice.USD, 10) / 100 : null;

            const extra = obj.extra || {};

            return {
              objectId:       obj.objectId || null,
              title:          itemTitle,
              price:          price,
              suggestedPrice: suggestedPrice,
              floatValue:     extra.floatValue != null ? parseFloat(extra.floatValue) : null,
              paintSeed:      extra.paintSeed != null ? parseInt(extra.paintSeed, 10) : null,
              phase:          extra.phase || null,  // e.g. "Phase 1", "Ruby", null
              isStatTrak:     extra.isStatTrak || false,
              isSouvenir:     extra.isSouvenir || false,
              exterior:       exterior,
              image:          obj.image || null,
              listingUrl:     obj.objectId
                ? `https://dmarket.com/ingame-items/item-list/csgo-skins?type=item&id=${obj.objectId}`
                : `https://dmarket.com/ingame-items/item-list/csgo-skins?userOffersSearch=${encodedTitle}`
            };
          }).filter(l => l.objectId && l.price != null && l.price > 0);

          resolve(listings);
        } catch (_) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

/**
 * Check if a DMarket listing matches a tracked item's criteria.
 * DMarket provides per-listing floats and pattern seeds (unlike Skinport REST),
 * so we can do precise float/pattern matching here.
 */
function doesDMarketListingMatch(listing, tracked) {
  // 1. Price
  if (tracked.min_price && listing.price < parseFloat(tracked.min_price)) return false;
  if (tracked.max_price && listing.price > parseFloat(tracked.max_price)) return false;

  // 2. StatTrak
  if (tracked.stattrak === 'required' && !listing.isStatTrak) return false;
  if (tracked.stattrak === 'none'     &&  listing.isStatTrak) return false;

  // 3. Souvenir
  if (tracked.souvenir === 'required' && !listing.isSouvenir) return false;
  if (tracked.souvenir === 'none'     &&  listing.isSouvenir) return false;

  // 4. Wear condition
  if (tracked.wear_type === 'preset' && tracked.preset_wear) {
    const wearRange = WEAR_RANGES[tracked.preset_wear];
    if (wearRange) {
      if (listing.floatValue != null) {
        // Precise float check
        if (listing.floatValue < wearRange.min || listing.floatValue >= wearRange.max) return false;
      } else if (listing.exterior) {
        // Fallback: exterior name from title
        if (!listing.exterior.toLowerCase().includes(wearRange.name.toLowerCase())) return false;
      }
    }
  }

  if (tracked.wear_type === 'custom') {
    if (listing.floatValue != null) {
      if (tracked.min_float && listing.floatValue < parseFloat(tracked.min_float)) return false;
      if (tracked.max_float && listing.floatValue > parseFloat(tracked.max_float)) return false;
    }
  }

  // 5. Pattern number
  if (tracked.pattern_number) {
    if (listing.paintSeed == null || listing.paintSeed !== parseInt(tracked.pattern_number, 10)) {
      return false;
    }
  }

  // 6. Doppler phase — DMarket returns the phase as a string (e.g. "Phase 1", "Ruby")
  //    Map the tracked finish_catalog ID through DOPPLER_PHASES to get the expected string.
  if (tracked.finish_catalog) {
    const expectedPhase = DOPPLER_PHASES[parseInt(tracked.finish_catalog, 10)];
    if (expectedPhase) {
      if (!listing.phase || listing.phase !== expectedPhase) return false;
    }
  }

  return true;
}

/**
 * Check DMarket for listings matching a single tracked item, save matches to DB,
 * and notify the user of any new ones found.
 */
async function checkDMarketListingsForItem(trackedItem) {
  if (trackedItem.status !== 'tracking') return;

  try {
    const listings = await fetchDMarketListings(trackedItem.weapon_name, trackedItem.skin_name);
    const newMatches = [];

    for (const listing of listings) {
      if (!doesDMarketListingMatch(listing, trackedItem)) continue;

      try {
        const result = await pool.query(
          `INSERT INTO skinport_matches
            (tracked_item_id, sale_id, market_hash_name, sale_price, suggested_price,
             wear_float, exterior, pattern, finish, stattrak, image_url, skinport_url, phase,
             source, external_id)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11, 'dmarket', $12)
           ON CONFLICT (tracked_item_id, external_id)
             WHERE source = 'dmarket' AND external_id IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            trackedItem.id,
            listing.title,
            listing.price,
            listing.suggestedPrice,
            listing.floatValue,
            listing.exterior,
            listing.paintSeed,
            listing.isStatTrak,
            listing.image,
            listing.listingUrl,
            listing.phase,
            listing.objectId
          ]
        );

        if (result.rows.length > 0) {
          newMatches.push(listing);
        }
      } catch (dbErr) {
        if (dbErr.code !== '23505') {
          console.error('Error saving DMarket match:', dbErr.message);
        }
      }
    }

    if (newMatches.length > 0) {
      console.log(`✅ DMarket: ${newMatches.length} new match(es) for ${trackedItem.weapon_name} | ${trackedItem.skin_name} (user ${trackedItem.user_id})`);
      notifyUserOfDMarketMatches(trackedItem.user_id, trackedItem, newMatches).catch(err => {
        console.error('DMarket notification error:', err.message);
      });
    }
  } catch (err) {
    console.error(`DMarket scan error for ${trackedItem.weapon_name} | ${trackedItem.skin_name}:`, err.message);
  }
}

/**
 * Scan DMarket for all currently active tracked items.
 * Adds a small delay between items to avoid triggering rate limits.
 */
async function checkAllDMarketListings() {
  console.log('🔍 DMarket: scanning listings for all tracked items...');
  try {
    const result = await pool.query(
      "SELECT * FROM tracked_items WHERE status = 'tracking'"
    );
    const allTracked = result.rows;

    if (allTracked.length === 0) {
      console.log('   DMarket: no active tracked items');
      return;
    }

    let totalNew = 0;
    for (let i = 0; i < allTracked.length; i++) {
      const tracked = allTracked[i];
      const before = totalNew;
      await checkDMarketListingsForItem(tracked);
      // Small inter-request delay so we don't hammer DMarket
      if (i < allTracked.length - 1) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    console.log(`🔍 DMarket scan complete`);
  } catch (err) {
    console.error('Error during DMarket scan:', err.message);
  }
}

/**
 * Send DMarket match notifications to a user via all their enabled methods.
 */
async function notifyUserOfDMarketMatches(userId, trackedItem, listings) {
  try {
    const settings = await pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1 AND enabled = true',
      [userId]
    );
    if (settings.rows.length === 0) return;

    for (const setting of settings.rows) {
      if (setting.method === 'discord') {
        try {
          await sendDMarketDiscordNotification(setting.value, trackedItem, listings);
        } catch (err) {
          console.error(`DMarket Discord notification failed for user ${userId}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error sending DMarket notifications:', err);
  }
}

/**
 * Format and send DMarket match results to Discord.
 */
async function sendDMarketDiscordNotification(webhookUrl, trackedItem, listings) {
  const itemName = `${trackedItem.weapon_name} | ${trackedItem.skin_name}`;

  const fields = listings.slice(0, 10).map((listing, i) => {
    const price    = listing.price != null ? `$${listing.price.toFixed(2)}` : 'N/A';
    const wear     = listing.exterior || 'Unknown';
    const floatStr = listing.floatValue != null ? `Float: ${listing.floatValue.toFixed(4)}\n` : '';
    const phase    = listing.phase ? ` (${listing.phase})` : '';
    const st       = listing.isStatTrak ? ' StatTrak™' : '';

    return {
      name:   `${i + 1}. ${wear}${phase}${st} — ${price}`,
      value:  `${floatStr}${listing.paintSeed ? `Pattern: #${listing.paintSeed}\n` : ''}[View on DMarket](${listing.listingUrl})`,
      inline: false
    };
  });

  const embed = {
    title:  `🎯 DMarket: ${listings.length} match${listings.length === 1 ? '' : 'es'} for ${itemName}`,
    color:  0x9b6fff,  // Purple to distinguish DMarket from Skinport (teal)
    fields: fields,
    footer: { text: 'CS2 Skin Tracker — DMarket' },
    timestamp: new Date().toISOString()
  };

  if (trackedItem.min_price || trackedItem.max_price) {
    const range = trackedItem.min_price && trackedItem.max_price
      ? `$${trackedItem.min_price} – $${trackedItem.max_price}`
      : trackedItem.min_price
        ? `From $${trackedItem.min_price}`
        : `Up to $${trackedItem.max_price}`;
    embed.description = `Target price range: ${range}`;
  }

  if (listings.length > 10) {
    embed.description = (embed.description || '') +
      `\n\n*Showing top 10 of ${listings.length} matches. Check your profile for all results.*`;
  }

  await sendDiscordNotification(webhookUrl, embed);
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

// Re-scan every 20 minutes — stagger DMarket by 2 min after Skinport
// to avoid hitting both APIs simultaneously and triggering rate limits.
setInterval(async () => {
  await cleanupOldMatches();
  await checkAllExistingListings();
  setTimeout(() => {
    checkAllDMarketListings().catch(err => console.error('DMarket rescan error:', err.message));
  }, 2 * 60 * 1000);
}, 20 * 60 * 1000);

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Connect to Skinport websocket for real-time new listings
  connectSkinportWebsocket();

  // Stagger startup tasks to avoid hitting Skinport rate limits on boot:
  // 1. Clean up old matches immediately
  // 2. Initial Skinport REST scan after 5s (gives websocket time to connect)
  // 3. DMarket scan after 90s (well after Skinport scan completes and cache is warm)
  setTimeout(cleanupOldMatches, 1000);

  setTimeout(async () => {
    await checkAllExistingListings();
  }, 5000);

  setTimeout(async () => {
    await checkAllDMarketListings();
  }, 90000);
});