const path = require("path");
// Load environment variables from .env.local and .env
require("dotenv").config({ path: path.join(__dirname, ".env.local") });
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

const { initDb } = require("./lib/db");
const branchesRouter = require("./routes/branches");
const rosterRouter = require("./routes/roster");
const attendanceRouter = require("./routes/attendance");
const leaveRouter = require("./routes/leave");

const app = express();
const PORT = process.env.PORT || 3000;

// Export maxDuration for Vercel Serverless Function execution (30 seconds)
const maxDuration = 30;

// Initialize database (loads seed and handles serverless /tmp if deployed on Vercel)
initDb();

// Explicit CORS headers and instant OPTIONS preflight handler
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Role");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(cors());
app.use(express.json());

// Guard against serverless connection hangs: respond before Vercel gateway timeout
app.use((req, res, next) => {
  req.setTimeout(25000, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Serverless function request timeout." });
    }
  });
  next();
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is healthy!",
    environment: process.env.NODE_ENV || "development",
    serverless: Boolean(process.env.VERCEL)
  });
});

app.use("/api/branches", branchesRouter);
app.use("/api/roster", rosterRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/leave", leaveRouter);

// Serve the frontend (public/index.html + public/app.js) as static files
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Centralized error handler so unhandled errors don't hang the connection
app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error: " + (err.message || "Unknown error") });
  }
});

// Only listen directly when executed as entry script (not when imported by Vercel or test suites)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nDepartment Attendance & Leave Register running at http://localhost:${PORT}\n`);
  });
}

module.exports = app;
module.exports.maxDuration = maxDuration;
