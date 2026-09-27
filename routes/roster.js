const express = require("express");
const router = express.Router();
const { readDb, writeDb, syncToSupabase } = require("../lib/db");
const { toISODate } = require("../lib/seed");

// POST /api/roster/students
router.post("/students", async (req, res) => {
  try {
    const { name, roll, branch } = req.body || {};
    if (!name || !roll || !branch) {
      return res.status(400).json({ error: "Name, roll, and branch are required." });
    }

    const db = readDb();
    if (!db.students) db.students = [];
    if (!db.branches) db.branches = [];

    // Ensure the branch exists in the db.branches list
    let branchItem = db.branches.find((b) => b.code === branch);
    if (!branchItem) {
      branchItem = {
        code: branch,
        full: branch,
        students: 1,
        faculty: 0
      };
      db.branches.push(branchItem);
    }

    const existing = db.students.find((s) => String(s.roll) === String(roll) && s.branch === branch);

    if (existing) {
      if (name && existing.name !== name) {
        existing.name = name;
        await writeDb(db);
      }
      return res.json({ message: "Student already registered.", student: existing });
    }

    const maxId = db.students.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0);
    const newStudent = {
      id: maxId + 1,
      name,
      roll: String(roll),
      branch
    };

    db.students.push(newStudent);
    branchItem.students = (branchItem.students || 0) + 1;
    await writeDb(db);

    // Sync to Supabase in the background if configured
    syncToSupabase("students", { name, roll: String(roll), branch });

    return res.status(201).json({ message: "Student registered successfully.", student: newStudent });
  } catch (err) {
    console.error("[roster] Error registering student:", err);
    return res.status(500).json({ error: "Failed to register student: " + err.message });
  }
});

// GET /api/roster/:branch?date=YYYY-MM-DD  (date optional, defaults to today)
router.get("/:branch", (req, res) => {
  try {
    const db = readDb();
    const branch = req.params.branch;
    const date = req.query.date || toISODate(new Date());

    const students = (db.students || []).filter((s) => s.branch === branch);
    if (students.length === 0) {
      return res.json({ branch, date, roster: [] });
    }

    const roster = students.map((s) => {
      const record = (db.attendance || []).find((a) => a.studentId === s.id && a.date === date);
      return { roll: s.roll, name: s.name, status: record ? record.status : "unmarked" };
    });

    res.json({ branch, date, roster });
  } catch (err) {
    console.error("[roster] Error fetching roster:", err);
    res.status(500).json({ error: "Failed to fetch roster: " + err.message });
  }
});

module.exports = router;
