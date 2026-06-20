const expresssi = require("express");
const routerss = expresssi.Router();
const { z: myZod } = require("zod");
routerss.use(expresssi.json());
const { AdminModel } = require("../src/db");
const { LoyalModel: AdminLoyalModel } = require("../src/db");
const { BookingsModels: AdminBookModel } = require("../src/db");
require("dotenv").config();
const Shop_Password = process.env.Shop_Password;
const jwts = require("jsonwebtoken");
const JWT_SECRETSS = process.env.JWT_SECRET_KEY;

// ── Rate limiting (in-memory) ─────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function getRateLimitKey(req: any): string {
  return req.ip || req.headers["x-forwarded-for"] || "unknown";
}

function checkRateLimit(key: string): { blocked: boolean; minutesLeft?: number } {
  const entry = loginAttempts.get(key);
  if (!entry) return { blocked: false };
  if (entry.lockedUntil > Date.now()) {
    return { blocked: true, minutesLeft: Math.ceil((entry.lockedUntil - Date.now()) / 60000) };
  }
  return { blocked: false };
}

function recordFailedAttempt(key: string) {
  const entry = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

// ── Admin auth middleware ─────────────────────────────────────────────────────
//@ts-ignore
function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Admin token required" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwts.verify(token, JWT_SECRETSS) as any;
    if (decoded.access !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }
    next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired admin token" });
  }
}

// ── POST /signin (rate-limited) ──────────────────────────────────────────────
//@ts-ignore
routerss.post("/signin", async (req, res) => {
  const key = getRateLimitKey(req);
  const limit = checkRateLimit(key);
  if (limit.blocked) {
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${limit.minutesLeft} minute(s).`,
    });
  }

  const { password } = req.body;
  if (!password) return res.status(400).json({ message: "Password required" });

  try {
    if (password !== Shop_Password) {
      recordFailedAttempt(key);
      const entry = loginAttempts.get(key);
      const attemptsLeft = MAX_ATTEMPTS - (entry?.count ?? 0);
      return res.status(401).json({
        error: `Incorrect password. ${attemptsLeft} attempt(s) remaining before lockout.`,
      });
    }

    clearAttempts(key);

    const token = jwts.sign(
      { access: "admin" },
      JWT_SECRETSS,
      { expiresIn: "72h" }
    );

    return res.status(200).json({ success: true, message: "Signin successful", token });
  } catch (err) {
    console.error("Signin error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// ── POST /all (protected) ────────────────────────────────────────────────────
//@ts-ignore
routerss.post("/all", adminAuthMiddleware, async (req, res) => {
  const date = req.body.date;
  try {
    const all = await AdminBookModel.find({ preferred_date: date });
    if (all.length === 0) return res.json({ message: "No users yet!" });
    return res.json({ message: all });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /check (protected, JWT-only, no raw fallback) ───────────────────────
//@ts-ignore
routerss.post("/check", adminAuthMiddleware, async (req, res) => {
  const { qrContent } = req.body;
  if (!qrContent) return res.status(400).json({ valid: false, message: "QR content is required" });

  try {
    const decoded = jwts.verify(qrContent, JWT_SECRETSS) as any;

    if (!decoded.qrPayload) {
      return res.status(400).json({ valid: false, message: "Invalid QR code" });
    }

    const [name, phone] = decoded.qrPayload.split("-");
    const customer = await AdminLoyalModel.findOne({ name, phone });

    if (!customer) {
      return res.status(404).json({ valid: false, message: "Customer not found" });
    }

    // Auto-mark today's booking as done
    const today = new Date().toISOString().split("T")[0];
    await AdminBookModel.findOneAndUpdate(
      { phone: customer.phone, preferred_date: today, done: false },
      { done: true }
    );

    return res.status(200).json({
      valid: true,
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        point: customer.point,
        reviewSubmitted: customer.reviewSubmitted || false,
      },
    });
  } catch {
    return res.status(401).json({ valid: false, message: "Invalid or tampered QR code" });
  }
});

// ── POST /done (protected) ───────────────────────────────────────────────────
//@ts-ignore
routerss.post("/done", adminAuthMiddleware, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });
  try {
    const updated = await AdminBookModel.findByIdAndUpdate(userId, { done: true }, { new: true });
    if (!updated) return res.status(404).json({ error: "Booking not found" });
    return res.status(200).json({ message: "Booking marked as done", booking: updated });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /add-points (protected) ─────────────────────────────────────────────
//@ts-ignore
routerss.post("/add-points", adminAuthMiddleware, async (req, res) => {
  try {
    const { userId, points } = req.body;
    if (!userId || points === undefined || points === null) return res.status(400).json({ error: "Missing required fields" });

    const customer = await AdminLoyalModel.findById(userId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const currentPoints = parseInt(customer.point) || 0;
    const newPoints = currentPoints + parseInt(points);

    const updated = await AdminLoyalModel.findByIdAndUpdate(
      userId,
      { $set: { point: newPoints.toString(), reviewSubmitted: false } },
      { new: true }
    );

    console.log(`ADD-POINTS: ${updated.name} | points: ${updated.point} | reviewSubmitted: ${updated.reviewSubmitted}`);

    return res.status(200).json({
      success: true,
      message: "Points added successfully",
      updatedPoints: newPoints,
    });
  } catch (err) {
    console.error("Add points error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /weekly-bookings (protected) ─────────────────────────────────────────
//@ts-ignore
routerss.get("/weekly-bookings", adminAuthMiddleware, async (req, res) => {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);

    const bookings = await AdminBookModel.find({
      preferred_date: {
        $gte: sevenDaysAgo.toISOString().split("T")[0],
        $lte: today.toISOString().split("T")[0],
      },
    });

    return res.status(200).json({ bookings });
  } catch {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /loyalty-leaderboard (protected) ─────────────────────────────────────
//@ts-ignore
routerss.get("/loyalty-leaderboard", adminAuthMiddleware, async (req, res) => {
  try {
    const leaderboard = await AdminLoyalModel.aggregate([
      { $addFields: { pointNum: { $toInt: "$point" } } },
      { $sort: { pointNum: -1 } },
      { $limit: 50 },
      { $project: { pointNum: 0 } }
    ]);
    return res.status(200).json({ success: true, leaderboard });
  } catch {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = routerss;
