const express = require("express");
const router = express.Router();
const { readDb, writeDb } = require("../lib/db");
const requireFaculty = require("../middleware/requireFaculty");

// GET /api/leave?branch=CSE&status=pending   (both filters optional)
// branch=all or omitted -> every branch. Used both for the per-branch
// approvals queue and for the "pending across all branches" overview.
router.get("/", (req, res) => {
  const db = readDb();
  let items = db.leaveRequests;

  if (req.query.branch && req.query.branch !== "all") {
    items = items.filter((r) => r.branch === req.query.branch);
  }
  if (req.query.status) {
    items = items.filter((r) => r.status === req.query.status);
  }

  items = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

// POST /api/leave   { name, roll, branch, from, to, reason }
router.post("/", async (req, res) => {
  const { name, roll, branch, from, to, reason } = req.body || {};
  if (!name || !roll || !branch || !from || !to || !reason) {
    return res.status(400).json({ error: "name, roll, branch, from, to and reason are all required." });
  }
  if (new Date(to) < new Date(from)) {
    return res.status(400).json({ error: '"To" date cannot be before "From" date.' });
  }

  const db = readDb();
  const request = {
    id: db.meta.nextLeaveId++,
    name,
    roll,
    branch,
    from,
    to,
    reason,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  db.leaveRequests.unshift(request);
  await writeDb(db);
  res.status(201).json(request);
});

// PATCH /api/leave/:id   { status: "approved" | "denied" }   [faculty only]
router.patch("/:id", requireFaculty, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!["approved", "denied"].includes(status)) {
    return res.status(400).json({ error: 'status must be "approved" or "denied".' });
  }

  const db = readDb();
  const request = db.leaveRequests.find((r) => r.id === id);
  if (!request) return res.status(404).json({ error: "Leave request not found." });

  request.status = status;
  request.decidedAt = new Date().toISOString();
  await writeDb(db);
  res.json(request);
});

module.exports = router;
