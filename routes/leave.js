const express = require("express");
const router = express.Router();
const { readDb, writeDb, syncToSupabase } = require("../lib/db");
const requireFaculty = require("../middleware/requireFaculty");

// GET /api/leave?branch=CSE&status=pending   (both filters optional)
router.get("/", (req, res) => {
  try {
    const db = readDb();
    let items = db.leaveRequests || [];

    if (req.query.branch && req.query.branch !== "all") {
      items = items.filter((r) => r.branch === req.query.branch);
    }
    if (req.query.status) {
      items = items.filter((r) => r.status === req.query.status);
    }

    items = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(items);
  } catch (err) {
    console.error("[leave] Error fetching leave requests:", err);
    return res.status(500).json({ error: "Failed to fetch leave requests: " + err.message });
  }
});

// POST /api/leave   { name, roll, branch, from, to, reason }
router.post("/", async (req, res) => {
  try {
    const { name, roll, branch, from, to, reason } = req.body || {};
    if (!name || !roll || !branch || !from || !to || !reason) {
      return res.status(400).json({ error: "name, roll, branch, from, to and reason are all required." });
    }
    if (new Date(to) < new Date(from)) {
      return res.status(400).json({ error: '"To" date cannot be before "From" date.' });
    }

    const db = readDb();
    if (!db.leaveRequests) db.leaveRequests = [];
    if (!db.meta) db.meta = { nextLeaveId: 1 };

    const nextId = db.meta.nextLeaveId || (db.leaveRequests.length + 1);
    db.meta.nextLeaveId = nextId + 1;

    const request = {
      id: nextId,
      name,
      roll: String(roll),
      branch,
      from,
      to,
      reason,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    db.leaveRequests.unshift(request);
    await writeDb(db);
    syncToSupabase("leave_requests", request);

    return res.status(201).json(request);
  } catch (err) {
    console.error("[leave] Error creating leave request:", err);
    return res.status(500).json({ error: "Failed to submit leave request: " + err.message });
  }
});

// PATCH /api/leave/:id   { status: "approved" | "denied" }   [faculty only]
router.patch("/:id", requireFaculty, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ error: 'status must be "approved" or "denied".' });
    }

    const db = readDb();
    const request = (db.leaveRequests || []).find((r) => r.id === id);
    if (!request) return res.status(404).json({ error: "Leave request not found." });

    request.status = status;
    request.decidedAt = new Date().toISOString();
    await writeDb(db);
    syncToSupabase("leave_requests", request);

    return res.json(request);
  } catch (err) {
    console.error("[leave] Error updating leave request:", err);
    return res.status(500).json({ error: "Failed to update leave request: " + err.message });
  }
});

module.exports = router;
