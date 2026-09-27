/**
 * Builds the initial contents of the "database" (data/db.json) the very
 * first time the server runs. After that, everything is read from and
 * written to that file, so this module is never touched again unless
 * you delete data/db.json to reset the app.
 */

const BRANCHES = [
  { code: "CSE", full: "Computer Science & Engineering", students: 820, faculty: 34 },
  { code: "AIDS", full: "AI & Data Science", students: 560, faculty: 26 },
  { code: "E&TC", full: "Electronics & Telecommunication", students: 640, faculty: 30 },
  { code: "IT", full: "Information Technology", students: 700, faculty: 32 },
  { code: "CE", full: "Computer Engineering", students: 700, faculty: 46 },
  { code: "CSE-AI", full: "CSE - Artificial Intelligence", students: 400, faculty: 20 },
  { code: "MECHANICAL", full: "Mechanical Engineering", students: 500, faculty: 25 },
  { code: "ECE", full: "Electronics & Communication Engineering", students: 450, faculty: 22 }
];

// Demo roster per branch (the students who are actually tracked day-to-day).
const ROSTERS = {
  CSE: [["01", "Aarav Mehta"], ["02", "Isha Kulkarni"], ["03", "Yash Pawar"], ["04", "Diya Joshi"], ["05", "Kunal Bhosale"], ["06", "Sanika Gaikwad"]],
  AIDS: [["01", "Advait Rao"], ["02", "Meera Nair"], ["03", "Om Deshpande"], ["04", "Tanvi Kale"], ["05", "Rutuja More"], ["06", "Sarthak Jadhav"]],
  "E&TC": [["01", "Prathamesh Sawant"], ["02", "Anushka Patil"], ["03", "Rehan Shaikh"], ["04", "Sakshi Chavan"], ["05", "Nikhil Pandit"], ["06", "Pooja Wagh"]],
  IT: [["01", "Aditya Kadam"], ["02", "Riya Bhagat"], ["03", "Harshal Mane"], ["04", "Sanjana Salunkhe"], ["05", "Yashraj Kolhe"], ["06", "Neha Thorat"]],
  CE: [["01", "Siddharth Jagtap"], ["02", "Vaishnavi Bhoir"], ["03", "Rohit Ghadge"], ["04", "Sneha Autade"], ["05", "Akshay Londhe"], ["06", "Komal Waghmare"]],
  "CSE-AI": [["01", "Aryan Shah"], ["02", "Kiara Das"], ["03", "Ishaan Gupta"], ["04", "Ananya Roy"], ["05", "Rohan Verma"], ["06", "Sia Malhotra"]],
  MECHANICAL: [["01", "Kabir Singh"], ["02", "Zoya Khan"], ["03", "Aryan Goel"], ["04", "Mira Kapoor"], ["05", "Vihaan Sharma"], ["06", "Avni Jain"]],
  ECE: [["01", "Siddharth Roy"], ["02", "Tanya Mani"], ["03", "Rishi Malhotra"], ["04", "Diya Iyer"], ["05", "Arjun Das"], ["06", "Kriti Sen"]]
};

// Deterministic pseudo-random generator so re-seeding always produces the
// same demo numbers (handy for testing) instead of different ones each time.
function seedRand(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function branchSeedNumber(code) {
  return code.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

function buildSeed() {
  // ---- students (roster) ----
  const students = [];
  let studentId = 1;
  Object.entries(ROSTERS).forEach(([branch, list]) => {
    list.forEach(([roll, name]) => {
      students.push({ id: studentId++, roll, name, branch });
    });
  });

  // ---- raw daily attendance, from Jan 1 of the current year up to today ----
  // This is what powers precise "daily" and "monthly"/"this year" figures.
  const attendance = [];
  let attId = 1;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);

  Object.keys(ROSTERS).forEach((branch) => {
    const bSeed = branchSeedNumber(branch);
    const branchDrift = seedRand(bSeed * 7 + 3);

    ROSTERS[branch].forEach(([roll]) => {
      const student = students.find((s) => s.branch === branch && s.roll === roll);
      const sSeed = roll.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const rnd = seedRand(bSeed * 13 + sSeed * 5 + 11);

      for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0) continue; // no classes on Sunday
        const baseline = 0.82 + branchDrift() * 0.12; // ~82-94% baseline per branch
        const present = rnd() < baseline;
        attendance.push({
          id: attId++,
          studentId: student.id,
          branch,
          date: toISODate(d),
          status: present ? "present" : "absent"
        });
      }
    });
  });

  // ---- archived yearly summaries for years before the current one ----
  // Real per-day records for past years aren't kept forever in most college
  // systems - they get rolled up into a single archived percentage instead.
  // The current year is always computed live from the "attendance" array above.
  const archivedYearly = [];
  const currentYear = now.getFullYear();
  Object.keys(ROSTERS).forEach((branch) => {
    const bSeed = branchSeedNumber(branch);
    const rnd = seedRand(bSeed * 17 + 5);
    for (let y = currentYear - 4; y < currentYear; y++) {
      archivedYearly.push({ branch, year: y, pct: Math.round(80 + rnd() * 15) });
    }
  });

  // ---- a few sample leave requests so the approvals queue isn't empty ----
  const nowIso = now.toISOString();
  const leaveRequests = [
    { id: 101, name: "Rohan Kulkarni", roll: "18", branch: "CSE", from: toISODate(addDays(now, -1)), to: toISODate(now), reason: "Family function out of town.", status: "pending", createdAt: nowIso },
    { id: 102, name: "Sneha Patil", roll: "07", branch: "AIDS", from: toISODate(addDays(now, 1)), to: toISODate(addDays(now, 1)), reason: "Medical appointment.", status: "pending", createdAt: nowIso },
    { id: 103, name: "Omkar Deshmukh", roll: "22", branch: "E&TC", from: toISODate(addDays(now, 3)), to: toISODate(addDays(now, 5)), reason: "Attending a technical symposium.", status: "pending", createdAt: nowIso },
    { id: 104, name: "Priya Shinde", roll: "31", branch: "IT", from: toISODate(addDays(now, -2)), to: toISODate(addDays(now, -2)), reason: "Not feeling well.", status: "approved", createdAt: nowIso, decidedAt: nowIso },
    { id: 105, name: "Aman Joshi", roll: "11", branch: "CE", from: toISODate(addDays(now, -4)), to: toISODate(addDays(now, -3)), reason: "Personal work.", status: "denied", createdAt: nowIso, decidedAt: nowIso }
  ];

  return {
    meta: { nextAttendanceId: attId, nextLeaveId: 106 },
    branches: BRANCHES,
    students,
    attendance,
    leaveRequests,
    archivedStats: { yearly: archivedYearly }
  };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

module.exports = { buildSeed, seedRand, toISODate };
