# Department Attendance & Leave Register — Backend

A real backend for the front end you had, wired up so every feature actually
works: students file leave requests, faculty accept/deny them, attendance is
marked per-student, and the daily/monthly/yearly charts are computed from
that real data instead of random numbers.

## Do you need any API keys?

**No.** Nothing in this project calls a third-party API, so there is nothing
to sign up for and no key to paste in anywhere. The only setting is which
local port the server listens on (`PORT` in `.env`, defaults to `3000`) —
copy `.env.example` to `.env` if you want to change it, otherwise you can
skip that step entirely.

## What's the "database"?

It's a single JSON file: `data/db.json`. It's created and pre-filled with
demo data automatically the first time you start the server — you don't
need to install or configure MySQL/Postgres/MongoDB/etc. All reads and
writes go through `lib/db.js`, so if this ever needs to grow into a real
database later, that's the only file that would need to change — none of
the route files talk to the file system directly.

If you ever want to wipe everything and start over with fresh demo data,
just delete `data/db.json` and restart the server; it will be regenerated.

## Project structure

```
dept-attendance-leave-register/
├── server.js               # Express app entry point
├── package.json
├── .env.example
├── lib/
│   ├── db.js                # reads/writes data/db.json (the "database")
│   └── seed.js               # builds the initial demo data
├── middleware/
│   └── requireFaculty.js     # blocks faculty-only actions for students
├── routes/
│   ├── branches.js           # GET  /api/branches
│   ├── roster.js              # GET  /api/roster/:branch
│   ├── attendance.js          # POST /api/attendance , GET /api/attendance/:branch
│   └── leave.js                # GET/POST /api/leave , PATCH /api/leave/:id
├── data/
│   └── db.json                 # auto-created on first run (your data lives here)
└── public/
    ├── index.html               # your front end (unchanged visually)
    └── app.js                    # now calls the API instead of using mock arrays
```

## Running it

```bash
cd dept-attendance-leave-register
npm install
npm start
```

Then open **http://localhost:3000** in your browser. That's it — the same
server serves both the front end and the API, so there's no separate
frontend server to run and no CORS setup to worry about.

## What changed vs. the original front end

The HTML/CSS is untouched — same look, same layout. The only things that
changed:

1. Four small `id` attributes were added to the hero "dimension" numbers
   (branches/students/faculty/avg-attendance) so they can be updated live.
2. The old `<script>` block full of hardcoded mock arrays was removed and
   replaced with `<script src="app.js"></script>`, which fetches everything
   from the API below.

## API reference

All endpoints are prefixed with `/api`. Faculty-only actions read a role
from the `X-Role` request header — the front end sends this automatically
based on the Student/Faculty toggle in the navbar.

| Method | Endpoint                                   | Purpose                                                                 | Role needed |
|--------|---------------------------------------------|--------------------------------------------------------------------------|-------------|
| GET    | `/api/branches`                             | List branches with a live "% present today" for each                    | any         |
| GET    | `/api/roster/:branch?date=YYYY-MM-DD`       | That branch's students and their status for a given day (default today) | any         |
| POST   | `/api/attendance`                           | Mark one student present/absent (`{branch, roll, status}`)               | **faculty** |
| GET    | `/api/attendance/:branch?period=daily\|monthly\|yearly` | Precise chart data computed from real records                 | any         |
| GET    | `/api/leave?branch=CSE&status=pending`      | List leave requests (both filters optional; `branch=all` = every branch) | any         |
| POST   | `/api/leave`                                | Student submits a leave request                                          | any         |
| PATCH  | `/api/leave/:id`                            | Accept/deny a request (`{status: "approved" \| "denied"}`)               | **faculty** |

### How the numbers are kept precise

- **Daily** = the last 7 calendar days, each day's percentage computed from
  the actual attendance marks recorded for that branch that day.
- **Monthly** = every month of the current year, averaged from the same raw
  records (months with no marks yet show `0`, which is correct — there's
  genuinely no data for the future).
- **Yearly** = the current year is computed live the same way; the four
  years before it are pulled from `archivedStats.yearly` in the database —
  representing rolled-up historical records the way a real college system
  would archive old years rather than keep every daily row forever.
- **Pending approvals** — the faculty panel now shows both the queue for the
  branch you're viewing *and* a running count/preview of every pending
  request across all five branches, so nothing sitting in another branch's
  queue goes unnoticed.

### A note on the Student/Faculty toggle

Just like in the original design, there's no login system — the toggle in
the navbar just switches which view you see. The backend enforces the same
rule server-side (via the `X-Role` header) so that, for example, a leave
request can't be silently approved from the student view even by accident.
This mirrors the front end's intent rather than being real authentication —
if you ever deploy this somewhere that isn't a trusted classroom setting,
add a real login step and replace the header check in
`middleware/requireFaculty.js` with a proper session/token check.

## Resetting or inspecting the data

`data/db.json` is plain, readable JSON — feel free to open it and look
around, or edit it by hand while the server is stopped (e.g. to add more
students to a roster). Delete the file and restart the server to reset
everything back to the seeded demo state.
