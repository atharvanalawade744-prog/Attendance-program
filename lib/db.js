/**
 * A tiny file-backed "database".
 *
 * Why not SQLite/Postgres? For a departmental register of this size, a single
 * JSON file is simpler to set up (no native modules to compile, no DB server
 * to install) and is plenty fast. All reads/writes are funneled through this
 * module, so if you later want to swap in a real database, this is the only
 * file that needs to change - every route just calls readDb()/writeDb().
 */

const fs = require("fs");
const path = require("path");
const { buildSeed } = require("./seed");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Chain every write onto this promise so two requests writing at the same
// time can never interleave and corrupt the file.
let writeQueue = Promise.resolve();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initDb() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf-8");
    console.log(`[db] Created new database with seed data at ${DB_FILE}`);
  } else {
    console.log(`[db] Using existing database at ${DB_FILE}`);
  }
}

function readDb() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) initDb();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeDb(data) {
  writeQueue = writeQueue.then(
    () => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8")
  );
  return writeQueue;
}

module.exports = { initDb, readDb, writeDb, DB_FILE };
