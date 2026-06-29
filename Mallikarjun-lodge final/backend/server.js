require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS configuration ──────────────────────────────────────────────────────
// Key points:
// 1. Authorization MUST be in allowedHeaders or browsers strip it on preflight.
// 2. maxAge: 0 disables preflight caching — without this, browsers may use a
//    cached preflight response from before the fix was applied, continuing to
//    strip Authorization for up to 2 hours in Chrome / 24 hours in Firefox.
// 3. exposedHeaders lets the frontend read Content-Disposition for file downloads.
const corsOptions = {
  origin: function (origin, callback) {
    // Allow all origins (localhost:5173, localhost:4173, any IP, any domain)
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',          // ← JWT token — MUST be here
    'Accept',
    'Origin',
    'X-Requested-With',
  ],
  exposedHeaders: [
    'Content-Disposition',    // ← needed for backup file download filename
    'Content-Length',
  ],
  credentials: false,
  optionsSuccessStatus: 200,
  maxAge: 0,                  // ← CRITICAL: disables preflight caching in browser
                              //   Forces every request to re-check CORS headers fresh.
                              //   Without this, a stale cached preflight (from a
                              //   previous server version) will continue stripping
                              //   Authorization even after fixing allowedHeaders.
};

app.use(cors(corsOptions));

// Respond to ALL preflight OPTIONS requests immediately with correct headers
// This must be registered BEFORE any other middleware or route handlers
app.options('*', cors(corsOptions));

// ── Body parser ─────────────────────────────────────────────────────────────
// Limits set high enough to handle webcam base64 images in JSON body
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── Static files ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cors: 'Authorization header allowed, preflight cache disabled' });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
async function startServer() {
  try {
    console.log('Initializing database schema...');
    await initDB();
    app.listen(PORT, () => {
      console.log(`✓ Backend running on port ${PORT}`);
      console.log(`✓ CORS: Authorization header allowed, maxAge=0 (no preflight cache)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
