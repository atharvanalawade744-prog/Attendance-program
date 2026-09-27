/**
 * Gate that mirrors the frontend's Student / Faculty toggle: the app sends
 * the currently-selected role in an "X-Role" header on every request, and
 * this middleware blocks the faculty-only actions (marking attendance,
 * accepting/denying leave) unless that header says "faculty".
 *
 * Note: this is a UI-consistency guard, not real authentication - there is
 * no login system in this project, so a technically savvy user could set
 * the header themselves. If you need real security (e.g. this will be used
 * outside a trusted classroom setting), add a proper login step that issues
 * a signed token, and check that token here instead of a plain header.
 */
module.exports = function requireFaculty(req, res, next) {
  const role = req.header("X-Role");
  if (role !== "faculty") {
    return res.status(403).json({ error: "Faculty access required for this action." });
  }
  next();
};
