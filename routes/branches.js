const express = require("express");
const router = express.Router();
const { readDb } = require("../lib/db");
const { toISODate } = require("../lib/seed");

function computeTodayPct(db, branchCode) {
  const today = toISODate(new Date());
  const records = (db.attendance || []).filter((a) => a.branch === branchCode && a.date === today);
  if (records.length === 0) return null; // nobody marked yet today
  const present = records.filter((a) => a.status === "present").length;
  return Math.round((present / records.length) * 100);
}

// GET /api/branches
router.get("/", (req, res) => {
  try {
    const db = readDb();
    const branches = db.branches || [];
    const result = branches.map((b) => ({ ...b, today: computeTodayPct(db, b.code) }));
    return res.json(result);
  } catch (err) {
    console.error("[branches] Error fetching branches:", err);
    return res.status(500).json({ error: "Failed to fetch branches: " + err.message });
  }
});

module.exports = router;
