require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcrypt');
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
    stattrak, pattern_number, notes
  } = req.body;

  if (!skin_id || !weapon_name || !skin_name) {
    return res.status(400).json({ error: 'skin_id, weapon_name, and skin_name are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tracked_items 
        (user_id, skin_id, weapon_name, skin_name, image_url, rarity, category,
         min_price, max_price, wear_type, preset_wear, min_float, max_float,
         stattrak, pattern_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [req.session.userId, skin_id, weapon_name, skin_name, image_url, rarity, category,
       min_price || null, max_price || null, wear_type || 'any', preset_wear || null,
       min_float || null, max_float || null, stattrak || 'any', pattern_number || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
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
    stattrak, pattern_number, notes, status
  } = req.body;

  try {
    // Make sure user owns this item
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
        notes = $9, status = $10, updated_at = NOW()
       WHERE id = $11 AND user_id = $12
       RETURNING *`,
      [min_price || null, max_price || null, wear_type || 'any', preset_wear || null,
       min_float || null, max_float || null, stattrak || 'any', pattern_number || null,
       notes || null, status || 'tracking', id, req.session.userId]
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

// Update item status only (for auto-updates like found/tracking)
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
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});