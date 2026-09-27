const express = require("express");
const router = express.Router();
const { readDb, writeDb, syncToSupabase } = require("../lib/db");
const requireFaculty = require("../middleware/requireFaculty");
const { toISODate } = require("../lib/seed");

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// POST /api/attendance   { branch, roll, status, date? }   [faculty only]
router.post("/", requireFaculty, async (req, res) => {
  try {
    const { branch, roll, status, date } = req.body || {};
    if (!branch || !roll || !["present", "absent"].includes(status)) {
      return res.status(400).json({ error: "branch, roll and a valid status ('present'/'absent') are required." });
    }

    const db = readDb();
    if (!db.students) db.students = [];
    if (!db.attendance) db.attendance = [];

    const student = db.students.find((s) => s.branch === branch && String(s.roll) === String(roll));
    if (!student) {
      return res.status(404).json({ error: `No student with roll ${roll} found in branch ${branch}.` });
    }

    const markDate = date || toISODate(new Date());
    let record = db.attendance.find((a) => a.studentId === student.id && a.date === markDate);

    if (record) {
      record.status = status;
    } else {
      if (!db.meta) db.meta = { nextAttendanceId: 1 };
      const nextId = db.meta.nextAttendanceId || (db.attendance.length + 1);
      db.meta.nextAttendanceId = nextId + 1;
      record = { id: nextId, studentId: student.id, branch, date: markDate, status };
      db.attendance.push(record);
    }

    await writeDb(db);
    syncToSupabase("attendance", record);

    return res.json({ ok: true, record });
  } catch (err) {
    console.error("[attendance] Error marking attendance:", err);
    return res.status(500).json({ error: "Failed to mark attendance: " + err.message });
  }
});

// GET /api/attendance/:branch?period=daily|monthly|yearly
router.get("/:branch", (req, res) => {
  try {
    const db = readDb();
    const branch = req.params.branch;
    const period = req.query.period || "daily";
    const records = (db.attendance || []).filter((a) => a.branch === branch);

    if (period === "daily") {
      const today = new Date();
      const labels = [];
      const data = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const iso = toISODate(d);
        const dayRecords = records.filter((a) => a.date === iso);
        const pct = dayRecords.length
          ? Math.round((dayRecords.filter((a) => a.status === "present").length / dayRecords.length) * 100)
          : 0;
        labels.push(d.toLocaleDateString("en-GB", { weekday: "short" }));
        data.push(pct);
      }
      return res.json({ labels, data });
    }

    if (period === "monthly") {
      const year = new Date().getFullYear();
      const data = MONTH_LABELS.map((_, idx) => {
        const monthRecords = records.filter((a) => {
          const [y, m] = a.date.split("-").map(Number);
          return y === year && m - 1 === idx;
        });
        if (!monthRecords.length) return 0;
        return Math.round((monthRecords.filter((a) => a.status === "present").length / monthRecords.length) * 100);
      });
      return res.json({ labels: MONTH_LABELS, data });
    }

    if (period === "yearly") {
      const currentYear = new Date().getFullYear();
      const years = [];
      for (let y = currentYear - 4; y <= currentYear; y++) years.push(y);
      const data = years.map((y) => {
        if (y === currentYear) {
          const yearRecords = records.filter((a) => a.date.startsWith(String(y)));
          if (!yearRecords.length) return 0;
          return Math.round((yearRecords.filter((a) => a.status === "present").length / yearRecords.length) * 100);
        }
        const yearlyStats = (db.archivedStats && db.archivedStats.yearly) || [];
        const archived = yearlyStats.find((r) => r.branch === branch && r.year === y);
        return archived ? archived.pct : 0;
      });
      return res.json({ labels: years.map(String), data });
    }

    return res.status(400).json({ error: "period must be one of: daily, monthly, yearly" });
  } catch (err) {
    console.error("[attendance] Error fetching analytics:", err);
    return res.status(500).json({ error: "Failed to fetch attendance analytics: " + err.message });
  }
});

module.exports = router;
