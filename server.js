require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const { initDb } = require("./lib/db");
const branchesRouter = require("./routes/branches");
const rosterRouter = require("./routes/roster");
const attendanceRouter = require("./routes/attendance");
const leaveRouter = require("./routes/leave");

const app = express();
const PORT = process.env.PORT || 3000;

// Make sure data/db.json exists (and is seeded) before anything else runs.
initDb();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is healthy!" });
});

app.use("/api/branches", branchesRouter);
app.use("/api/roster", rosterRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/leave", leaveRouter);

// Serve the frontend (public/index.html + public/app.js) as static files.
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\nDepartment Attendance & Leave Register running at http://localhost:${PORT}\n`);
});
