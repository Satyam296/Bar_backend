const jwtss = require("jsonwebtoken");
const JWT_SECRETSSS = process.env.JWT_SECRET_KEY || "your-jwt-secret";

//@ts-ignore
function verifyAdminToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwtss.verify(token, JWT_SECRETSSS);
    if (decoded.access !== "admin") {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.adminAccess = decoded.access;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = verifyAdminToken;
