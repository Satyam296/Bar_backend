const expresss = require("express");
const { z } = require("zod");
const { BookingsModels, LoyalModel } = require("../src/db");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const JWT_SECRETS = process.env.JWT_SECRET_KEY;
const { authMiddleware } = require("./middleware");
const routers = expresss.Router();
routers.use(expresss.json());

//@ts-ignore
function formatZodErrors(zodError) {
  //@ts-ignore
  return zodError.errors.map((err) => ({
    [err.path[0]]: { _errors: [err.message] },
  }));
}

const bookingSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
  service: z.string().min(1, "Please select a service"),
  preferred_date: z.string().min(1, "Date is required"),
  preferred_time: z.string().min(1, "Time is required"),
});

const loyalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
});

// @ts-ignore
routers.post("/book", async (req, res) => {
  const result = bookingSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json(formatZodErrors(result.error));
  }
  const { name, phone } = req.body;
  try {
    const loyal = await LoyalModel.findOne({ name, phone });
    const pointss = loyal?.point ?? 0;
    const bookingData = { ...result.data, isLoyal: loyal ? true : false, points: pointss };
    const newBooking = new BookingsModels(bookingData);
    await newBooking.save();
    return res.status(200).json({ message: "Booking successful!" });
  } catch (err) {
    console.error("Error saving booking:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

//@ts-ignore
routers.post("/loyal", async (req, res) => {
  const result = loyalSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json(formatZodErrors(result.error));
  }

  try {
    const { name, phone, email } = req.body;
    let existingUser = await LoyalModel.findOne({ name, phone, email });

    if (!existingUser) {
      const qrPayload = `${name}-${phone}`;
      const qrData = jwt.sign({ qrPayload, role: "user" }, JWT_SECRETS, { noTimestamp: true });

      const newLoyal = new LoyalModel({
        name, phone, email,
        point: "150",
        data: qrData,
        qrImage: "",
        reviewSubmitted: false,
      });
      await newLoyal.save();

      const token = jwt.sign({ userId: newLoyal._id, role: "user" }, JWT_SECRETS, { expiresIn: "30d" });
      return res.status(200).json({
        message: "Now a loyal customer!",
        imp: token,
        qrToken: qrData,
        points: "150",
      });
    } else {
      const token = jwt.sign({ userId: existingUser._id, role: "user" }, JWT_SECRETS, { expiresIn: "30d" });
      return res.status(200).json({
        message: "Already a loyal customer!",
        imp: token,
        qrToken: existingUser.data,
        points: existingUser.point,
      });
    }
  } catch (err) {
    console.error("Error saving loyal data:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

//@ts-ignore
routers.get("/loyal_name", authMiddleware, async (req, res) => {
  if (!req.userId) {
    return res.status(411).json({ message: "Token is not entered" });
  }
  const name = await LoyalModel.findOne({ _id: req.userId });
  res.json({ name });
});

//@ts-ignore
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] =
        a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j - 1] + 1
            );
    }
  }
  return matrix[a.length][b.length];
}

//@ts-ignore
function textSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

//@ts-ignore
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

//@ts-ignore
routers.post("/submit-review-proof", authMiddleware, async (req, res) => {
  try {
    const user = await LoyalModel.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.reviewSubmitted) return res.status(400).json({ message: "Review already submitted for this visit." });

    const { ocrText } = req.body;
    if (!ocrText || typeof ocrText !== "string" || ocrText.trim().length < 10) {
      return res.status(400).json({ message: "Invalid review screenshot. Please upload a clear screenshot." });
    }

    const normalized = normalizeText(ocrText);

    const allUsers = await LoyalModel.find({ reviewTexts: { $exists: true, $ne: [] } });
    let isDuplicate = false;
    for (const u of allUsers) {
      //@ts-ignore
      for (const prev of u.reviewTexts) {
        if (textSimilarity(normalizeText(prev), normalized) > 0.80) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) break;
    }

    if (isDuplicate) {
      return res.status(400).json({
        message: "This review screenshot has already been submitted. Please post a new Google review to earn points.",
      });
    }

    user.reviewTexts.push(ocrText.trim());
    user.point = (parseInt(user.point) + 500).toString();
    user.reviewSubmitted = true;
    await user.save();

    return res.status(200).json({ message: "Review verified! 500 points added.", pointsAdded: 500 });
  } catch (err) {
    console.error("Review proof submission failed:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = routers;
