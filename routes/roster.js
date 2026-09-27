const express = require("express");
const router = express.Router();
const { readDb, writeDb } = require("../lib/db");
const { toISODate } = require("../lib/seed");

// POST /api/students
router.post("/students", async (req, res) => {
  const { name, roll, branch } = req.body;
  if (!name || !roll || !branch) {
    return res.status(400).json({ error: "Name, roll, and branch are required." });
  }

  const db = readDb();

  // Ensure the branch exists in the db.branches list
  const branchExists = db.branches.find(b => b.code === branch);
  if (!branchExists) {
    db.branches.push({
      code: branch,
      full: branch, // Default full name to the code if not provided
      students: 0,
      faculty: 0
    });
  }

  const existing = db.students.find((s) => s.roll === roll && s.branch === branch);

  if (existing) {
    return res.json({ message: "Student already exists.", student: existing });
  }

  const newStudent = {
    id: db.students.length + 1,
    name,
    roll,
    branch
  };

  db.students.push(newStudent);
  await writeDb(db);

  res.status(201).json({ message: "Student registered successfully.", student: newStudent });
});

// GET /api/roster/:branch?date=YYYY-MM-DD  (date optional, defaults to today)
router.get("/:branch", (req, res) => {

  const db = readDb();
  const branch = req.params.branch;
  const date = req.query.date || toISODate(new Date());

  const students = db.students.filter((s) => s.branch === branch);
  if (students.length === 0) {
    return res.status(404).json({ error: `No roster found for branch "${branch}".` });
  }

  const roster = students.map((s) => {
    const record = db.attendance.find((a) => a.studentId === s.id && a.date === date);
    return { roll: s.roll, name: s.name, status: record ? record.status : "unmarked" };
  });

  res.json({ branch, date, roster });
});

module.exports = router;
