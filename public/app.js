/* =========================================================================
   Departmental Attendance & Leave Register — frontend logic
   Talks to the backend over the /api/* endpoints (see routes/ on the server).
   ========================================================================= */

// Same-origin by default (the Express server serves this file itself).
// Dynamic API base: Use relative path by default to prevent CORS/redirect issues
const API_BASE = "";

/* ---------------- tiny fetch helper with timeout ---------------- */
async function api(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Role": currentRole,
        ...(options.headers || {})
      }
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Request timed out (server took too long to respond). Please try again.");
    }
    throw err;
  }
}

/* ---------------- branches & hero stats ---------------- */
async function loadBranches() {
  try {
    branches = await api("/api/branches");
  } catch (err) {
    console.error("Failed to fetch branches from API, using static fallback:", err);
    branches = [
      { code: "E&TC", full: "Electronics & Telecommunication", students: 640, faculty: 30, today: null },
      { code: "CSE", full: "Computer Science & Engineering", students: 820, faculty: 34, today: null },
      { code: "AIDS", full: "AI & Data Science", students: 560, faculty: 26, today: null },
      { code: "IT", full: "Information Technology", students: 700, faculty: 32, today: null },
      { code: "CE", full: "Computer Engineering", students: 700, faculty: 46, today: null },
      { code: "CSE-AI", full: "CSE - Artificial Intelligence", students: 400, faculty: 20, today: null },
      { code: "MECHANICAL", full: "Mechanical Engineering", students: 500, faculty: 25, today: null },
      { code: "ECE", full: "Electronics & Communication Engineering", students: 450, faculty: 22, today: null },
    ];
  }

  // Sort branches so E&TC is always first
  branches.sort((a, b) => (a.code === "E&TC" ? -1 : b.code === "E&TC" ? 1 : 0));

  const branchRow = document.getElementById("branchRow");
  branchRow.innerHTML = "";
  branches.forEach((b) => {
    const tab = document.createElement("button");
    tab.className = "branch-tab" + (b.code === currentBranch ? " active" : "");
    tab.dataset.code = b.code;
    const pctLabel = b.today === null ? "—" : b.today;
    tab.innerHTML = `${branchIcons[b.code] || ""}<span class="b-name">${b.code}</span><span class="b-full">${b.full}</span><span class="b-pct">${pctLabel}</span>`;
    tab.addEventListener("click", () => selectBranch(b.code));
    branchRow.appendChild(tab);
  });

  const stuBranchSelect = document.getElementById("stuBranch");
  if (stuBranchSelect && !stuBranchSelect.dataset.filled) {
    branches.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.code;
      opt.textContent = `${b.code} — ${b.full}`;
      stuBranchSelect.appendChild(opt);
    });
    stuBranchSelect.dataset.filled = "1";
  }

  updateHeroDims();
}

function updateHeroDims() {
  const marked = branches.filter((b) => b.today !== null);
  const avg = marked.length ? Math.round(marked.reduce((a, b) => a + b.today, 0) / marked.length) : 0;
  const totalStudents = branches.reduce((a, b) => a + b.students, 0);
  const totalFaculty = branches.reduce((a, b) => a + b.faculty, 0);

  const dimBranches = document.getElementById("dimBranches");
  const dimStudents = document.getElementById("dimStudents");
  const dimFaculty = document.getElementById("dimFaculty");
  const dimAvg = document.getElementById("dimAvg");
  if (dimBranches) dimBranches.textContent = String(branches.length).padStart(2, "0");
  if (dimStudents) dimStudents.textContent = totalStudents.toLocaleString("en-IN");
  if (dimFaculty) dimFaculty.textContent = totalFaculty;
  if (dimAvg) dimAvg.innerHTML = `${avg}<span>%</span>`;
}

async function selectBranch(code) {
  currentBranch = code;
  document.querySelectorAll(".branch-tab").forEach((t) => t.classList.toggle("active", t.dataset.code === code));
  document.getElementById("analyticsHeading").textContent = `${code} — Attendance Breakdown`;
  document.getElementById("markBranchLabel").textContent = code;
  await Promise.all([loadAnalytics(), loadTodayStats(), renderApprovals(), renderRoster()]);
}

/* ---------------- chart & analytics ---------------- */
function initChart() {
  const ctx = document.getElementById("attendanceChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Attendance %", data: [], backgroundColor: "#5aa9d6", borderRadius: 2, maxBarThickness: 34 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, ticks: { color: "#c9d6e3", font: { family: "IBM Plex Mono", size: 10 } }, grid: { color: "rgba(90,169,214,0.15)" } },
        x: { ticks: { color: "#c9d6e3", font: { family: "IBM Plex Mono", size: 10 } }, grid: { display: false } }
      }
    }
  });
}

// Pulls the precise daily/monthly/yearly series for the current branch
// straight from the attendance records on the server and draws the chart.
async function loadAnalytics() {
  const series = await api(`/api/attendance/${encodeURIComponent(currentBranch)}?period=${currentPeriod}`);
  chart.data.labels = series.labels;
  chart.data.datasets[0].data = series.data;
  chart.update();

  const validPoints = series.data.filter((v) => v > 0);
  const avg = validPoints.length ? Math.round(validPoints.reduce((a, c) => a + c, 0) / validPoints.length) : 0;
  document.getElementById("statAvg").textContent = avg + "%";
}

// Present / Absent / On-leave for *today*, computed from the live roster
// and any approved leave requests that cover today's date.
async function loadTodayStats() {
  const b = branches.find((x) => x.code === currentBranch);
  const roster = await api(`/api/roster/${encodeURIComponent(currentBranch)}`);
  const total = roster.roster.length || 1;
  const presentCount = roster.roster.filter((s) => s.status === "present").length;
  const absentCount = roster.roster.filter((s) => s.status === "absent").length;

  const todayISO = new Date().toISOString().slice(0, 10);
  const approvedLeave = await api(`/api/leave?branch=${encodeURIComponent(currentBranch)}&status=approved`);
  const onLeaveCount = approvedLeave.filter((r) => r.from <= todayISO && todayISO <= r.to).length;

  const presentPct = b && b.today !== null ? b.today : Math.round((presentCount / total) * 100);
  const absentPct = Math.round((absentCount / total) * 100);
  const onLeavePct = Math.round((onLeaveCount / total) * 100);

  document.getElementById("statPresent").textContent = presentPct + "%";
  document.getElementById("statAbsent").textContent = absentPct + "%";
  document.getElementById("statLate").textContent = onLeavePct + "%";
}

document.getElementById("periodSwitch").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  document.querySelectorAll("#periodSwitch button").forEach((b) => b.classList.remove("active"));
  e.target.classList.add("active");
  currentPeriod = e.target.dataset.period;
  loadAnalytics();
});

/* ---------------- roster / mark attendance (faculty-only) ---------------- */
async function renderRoster() {
  const area = document.getElementById("rosterArea");
  const isFaculty = currentRole === "faculty";

  if (!isFaculty) {
    area.innerHTML = `<div class="locked-note">Faculty access required to mark attendance.<br>Switch the toggle in the top navigation to "Faculty".</div>`;
    return;
  }

  try {
    const data = await api(`/api/roster/${encodeURIComponent(currentBranch)}`);
    const roster = data.roster;
    const presentCount = roster.filter((s) => s.status === "present").length;
    area.innerHTML = `<div class="roster-summary"><span>${presentCount}</span> of <span>${roster.length}</span> marked present so far</div>`;

    roster.forEach((s) => {
      const row = document.createElement("div");
      row.className = "roster-row";
      row.innerHTML = `
        <div>
          <div class="who">${s.name} <span style="color:var(--ink-soft); font-weight:400;">· Roll ${s.roll}</span></div>
          <div class="meta">${currentBranch} — Section A</div>
        </div>
        <div class="roster-actions">
          <button class="mark-btn present ${s.status === "present" ? "is-active" : ""}" data-roll="${s.roll}" data-status="present">Present</button>
          <button class="mark-btn absent ${s.status === "absent" ? "is-active" : ""}" data-roll="${s.roll}" data-status="absent">Absent</button>
        </div>
      `;
      area.appendChild(row);
    });

    area.querySelectorAll(".mark-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const roll = btn.dataset.roll;
        const status = btn.dataset.status;
        try {
          await api("/api/attendance", { method: "POST", body: JSON.stringify({ branch: currentBranch, roll, status }) });
          await loadBranches();
          await renderRoster();
          await loadTodayStats();
          await loadAnalytics();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    area.innerHTML = `<div class="locked-note">No students found in this branch yet.</div>`;
  }
}

/* ---------------- role management ---------------- */
const roleModal = document.getElementById("roleModal");
const modalForm = document.getElementById("modalForm");
const rollField = document.getElementById("rollField");
const modalBranchSelect = document.getElementById("modalBranch");
let selectedRole = null;

async function setRole(role) {
  currentRole = role;
  document.body.dataset.role = role;
  try {
    await Promise.all([renderApprovals(), renderRoster()]);
  } catch (err) {
    console.error("Error during role setup:", err);
  }
}

async function handleModalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("modalName").value.trim();
  const roll = document.getElementById("modalRoll").value.trim();
  const branch = document.getElementById("modalBranch").value;

  if (!selectedRole) {
    alert("Please select your role (Student or Faculty) before continuing.");
    return;
  }
  if (!name) {
    alert("Please enter your full name.");
    return;
  }
  if (!branch) {
    alert("Please select your branch.");
    return;
  }

  // Pre-fill form inputs in the dashboard with user credentials
  const stuName = document.getElementById("stuName");
  const stuRoll = document.getElementById("stuRoll");
  const stuBranch = document.getElementById("stuBranch");
  if (stuName) stuName.value = name;
  if (stuRoll && roll) stuRoll.value = roll;
  if (stuBranch) stuBranch.value = branch;

  try {
    if (selectedRole === "student") {
      if (!roll) {
        alert("Please enter your roll number.");
        return;
      }
      try {
        await api("/api/roster/students", {
          method: "POST",
          body: JSON.stringify({ name, roll, branch }),
        });
      } catch (apiErr) {
        console.warn("Student registration notice:", apiErr);
      }
    }

    // Hide modal so user can proceed
    roleModal.style.display = "none";

    // Set role and load data in the background
    await setRole(selectedRole);
  } catch (err) {
    console.error("Login error:", err);
    alert("Login failed: " + err.message);
    roleModal.style.display = "flex";
  }
}

document.querySelectorAll(".role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRole = btn.dataset.role;

    modalForm.classList.add("active");
    const isStudent = selectedRole === "student";
    rollField.style.display = isStudent ? "flex" : "none";

    // The roll number input is only relevant for students. Hiding its
    // container isn't enough: a hidden-but-required field still fails the
    // browser's native form validation (it can't be focused to show the
    // "please fill this out" message), which silently blocks submission.
    // That's why Faculty could never actually log in. Toggling `required`
    // here fixes it.
    const modalRoll = document.getElementById("modalRoll");
    modalRoll.required = isStudent;
    if (!isStudent) modalRoll.value = "";
  });
});

modalForm.addEventListener("submit", handleModalSubmit);

async function initRoleSelection() {
  // Removed localStorage check to ensure login page always shows

  // Hardcoded branches list to ensure the menu always works
  const staticBranches = [
    { code: "E&TC", full: "Electronics & Telecommunication" },
    { code: "CSE", full: "Computer Science & Engineering" },
    { code: "AIDS", full: "AI & Data Science" },
    { code: "IT", full: "Information Technology" },
    { code: "CE", full: "Computer Engineering" },
    { code: "CSE-AI", full: "CSE - Artificial Intelligence" },
    { code: "MECHANICAL", full: "Mechanical Engineering" },
    { code: "ECE", full: "Electronics & Communication Engineering" },
  ];

  // Clear and add placeholder
  modalBranchSelect.innerHTML = '<option value="" disabled selected>Select a branch...</option>';

  staticBranches.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.code;
    opt.textContent = `${b.code} — ${b.full}`;
    modalBranchSelect.appendChild(opt);
  });
}

/* ---------------- leave requests ---------------- */
document.getElementById("leaveForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("stuName").value.trim();
  const roll = document.getElementById("stuRoll").value.trim();
  const branch = document.getElementById("stuBranch").value;
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  const reason = document.getElementById("reason").value.trim();
  if (!name || !roll || !from || !to || !reason) return;

  try {
    await api("/api/leave", { method: "POST", body: JSON.stringify({ name, roll, branch, from, to, reason }) });
    e.target.reset();
    await renderApprovals();
    alert(`Leave request submitted for ${branch}. Faculty will review it shortly.`);
  } catch (err) {
    alert(err.message);
  }
});

function fmtDate(d) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Renders the faculty approvals card: a small "pending across all branches"
// overview on top, then the full pending/decided list for every branch —
// not just whichever branch tab happens to be selected up top. The branch
// tabs control Mark Attendance / Analytics; leave approvals are departmental,
// so faculty can act on any student's request from here regardless of which
// branch is currently selected.
async function renderApprovals() {
  const area = document.getElementById("approvalArea");
  const isFaculty = currentRole === "faculty";

  if (!isFaculty) {
    area.innerHTML = `<div class="locked-note">Faculty access required to view and act on requests.<br>Switch the toggle in the top navigation to "Faculty".</div>`;
    return;
  }

  try {
    const allItems = await api(`/api/leave`);
    const pendingAll = allItems.filter((r) => r.status === "pending");
    const decidedAll = allItems.filter((r) => r.status !== "pending");

    let html = "";
    if (pendingAll.length > 0) {
      const preview = pendingAll.slice(0, 5).map((r) => `${r.branch}/Roll ${r.roll}`).join(", ");
      html += `<div class="roster-summary">
        <span>${pendingAll.length}</span> pending across all branches — ${preview}${pendingAll.length > 5 ? ", …" : ""}
      </div>`;
    } else {
      html += `<div class="roster-summary">No pending requests in any branch right now.</div>`;
    }

    if (allItems.length === 0) {
      html += `<div class="empty-note">No leave requests filed yet.</div>`;
      area.innerHTML = html;
      return;
    }

    [...pendingAll, ...decidedAll].forEach((r) => {
      const dateRange = r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
      let actionHtml = "";
      if (r.status === "pending") {
        actionHtml = `<div class="request-actions">
          <button class="pill-btn accept" data-id="${r.id}" data-action="approved">Accept</button>
          <button class="pill-btn deny" data-id="${r.id}" data-action="denied">Deny</button>
        </div>`;
      } else {
        actionHtml = `<span class="stamp ${r.status}">${r.status.toUpperCase()}</span>`;
      }
      html += `
        <div class="request-item">
          <div>
            <div class="who">${r.name} <span style="color:var(--ink-soft); font-weight:400;">· Roll ${r.roll} · ${r.branch}</span></div>
            <div class="meta">${dateRange}</div>
            <div class="reason">${r.reason}</div>
          </div>
          ${actionHtml}
        </div>
      `;
    });

    area.innerHTML = html;

    area.querySelectorAll(".pill-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        try {
          await api(`/api/leave/${id}`, { method: "PATCH", body: JSON.stringify({ status: action }) });
          await renderApprovals();
          await loadTodayStats();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    area.innerHTML = `<div class="empty-note">Error loading leave requests.</div>`;
  }
}

/* ---------------- init ---------------- */
(async function init() {
  try {
    initChart();
    await loadBranches();
  } catch (err) {
    console.error("Initialization error during loadBranches:", err);
  }

  try {
    await initRoleSelection();
  } catch (err) {
    console.error("Initialization error during initRoleSelection:", err);
  }

  try {
    await selectBranch(currentBranch);
  } catch (err) {
    console.error("Initialization error during selectBranch:", err);
  }
})();
