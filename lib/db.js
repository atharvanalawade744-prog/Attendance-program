/**
 * A tiny file-backed database with serverless (/tmp) and Supabase support.
 *
 * Supports both local development (writing to data/db.json) and
 * serverless deployment on Vercel/AWS Lambda (where filesystem is read-only
 * except for /tmp).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { buildSeed } = require("./seed");

// Detect serverless environment (Vercel, AWS Lambda, or read-only container)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const BUNDLED_DIR = path.join(__dirname, "..", "data");
const BUNDLED_DB = path.join(BUNDLED_DIR, "db.json");

// In serverless, use /tmp which is the only writable directory
const DATA_DIR = isServerless ? os.tmpdir() : BUNDLED_DIR;
const DB_FILE = isServerless ? path.join(DATA_DIR, "dept-attendance-db.json") : BUNDLED_DB;

let inMemoryCache = null;
let writeQueue = Promise.resolve();

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[db] ensureDataDir warning:", err.message);
  }
}

function initDb() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DB_FILE)) {
      if (fs.existsSync(BUNDLED_DB)) {
        try {
          fs.copyFileSync(BUNDLED_DB, DB_FILE);
          console.log(`[db] Initialized writable database at ${DB_FILE}`);
        } catch (copyErr) {
          const raw = fs.readFileSync(BUNDLED_DB, "utf-8");
          fs.writeFileSync(DB_FILE, raw, "utf-8");
        }
      } else {
        const seed = buildSeed();
        fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf-8");
        console.log(`[db] Created new database with seed data at ${DB_FILE}`);
      }
    } else {
      console.log(`[db] Using existing database at ${DB_FILE}`);
    }
  } catch (err) {
    console.warn("[db] initDb warning, falling back to memory:", err.message);
    if (!inMemoryCache) {
      if (fs.existsSync(BUNDLED_DB)) {
        try {
          inMemoryCache = JSON.parse(fs.readFileSync(BUNDLED_DB, "utf-8"));
        } catch (e) {
          inMemoryCache = buildSeed();
        }
      } else {
        inMemoryCache = buildSeed();
      }
    }
  }
}

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) initDb();
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      inMemoryCache = JSON.parse(raw);
      return inMemoryCache;
    }
  } catch (err) {
    console.warn("[db] readDb file warning, using memory cache:", err.message);
  }

  if (!inMemoryCache) {
    if (fs.existsSync(BUNDLED_DB)) {
      try {
        inMemoryCache = JSON.parse(fs.readFileSync(BUNDLED_DB, "utf-8"));
      } catch (e) {
        inMemoryCache = buildSeed();
      }
    } else {
      inMemoryCache = buildSeed();
    }
  }
  return inMemoryCache;
}

function writeDb(data) {
  inMemoryCache = data;
  writeQueue = writeQueue
    .catch((err) => {
      console.warn("[db] Caught previous write error to prevent queue deadlock:", err.message);
    })
    .then(() => {
      try {
        ensureDataDir();
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
      } catch (err) {
        console.warn("[db] writeDb file warning (kept in memory cache):", err.message);
      }
    });
  return writeQueue;
}

// Optional Supabase sync for cross-instance persistence with strict timeout
async function syncToSupabase(table, record) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(record),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (err) {
    // Non-blocking background sync - never hangs function execution
  }
}

module.exports = { initDb, readDb, writeDb, syncToSupabase, DB_FILE };
