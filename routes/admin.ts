const expresssi = require("express");
const routerss = expresssi.Router();
const { z:myZod } = require("zod");
routerss.use(expresssi.json());
const {AdminModel} = require("../src/db");
const { LoyalModel: AdminLoyalModel} = require("../src/db");
const {BookingsModels : AdminBookModel} = require("../src/db") ; 
require("dotenv").config() ; 
const Shop_Password = process.env.Shop_Password || "your-default-password";
const JWT_SECRETSS = process.env.JWT_SECRET_KEY || "your-jwt-secret";
const jwts = require("jsonwebtoken") ; 
const verifyAdminTokens = require("./verifyAdminToken");
const corss = require("cors");
routerss.use(corss());



const AdminSchema = myZod.object({
  name: myZod.string().min(1, "Name is required"),
  email: myZod.string().email("Invalid email format"),
  phone : myZod.string().min(10, "Phone must be at least 10 digits"),
  password: myZod.string().min(10, "Password must be have least 10 digits")
});

//@ts-ignore
function formatZodErrors(zodError) {
//@ts-ignore
  return zodError.errors.map((err) => ({
    [err.path[0]]: {
      _errors: [err.message],
    },
  }));
}

routerss.use(expresssi.json({ limit: '2mb' }));
routerss.use(expresssi.urlencoded({ extended: true, limit: '2mb' }));

// @ts-ignore
routerss.post("/signin", async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: "Password required" });
  }

  try {
    if (password !== Shop_Password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate JWT token for admin
    const token = jwts.sign(
      { access: "admin" }, // store only access type
      JWT_SECRETSS,
      { expiresIn: "72h" } 
    );

    return res.status(200).json({
      success: true,
      message: "Signin successful",
      token  // ← send token to frontend
    });

  } catch (err) {
    console.error("Signin error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


 
//@ts-ignore 
routerss.post("/all", verifyAdminTokens, async (req, res) => {
  const date = req.body.date;

  try {
    const all = await AdminBookModel.find({
      preferred_date: date
    });

    if (all.length === 0) {
      return res.json({ message: "No users yet!" });
    } else {
      return res.json({ message: all });
    }
  } catch (error) {
    console.error("Error fetching this day bookings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
//@ts-ignore
routerss.post("/check", async (req, res) => {
  const qrContent = req.body.qrContent;
  if (!qrContent) {
    return res.status(400).json({ error: "QR content is required" });
  }

  try {
    console.log("Received QR content:", qrContent);

    let userIdentifier;
    
    // Try to decode as JWT first
    try {
      const decoded = jwts.verify(qrContent, JWT_SECRETSS);
      userIdentifier = decoded.qrPayload;
      console.log("Decoded from JWT:", userIdentifier);
    } catch (jwtErr) {
      // If not JWT, use the raw content
      userIdentifier = qrContent;
      console.log("Using raw QR content:", userIdentifier);
    }

    // Parse the identifier (expected format: "name-phone")
    const parts = userIdentifier.split("-");
    if (parts.length < 2) {
      return res.status(400).json({ error: "Invalid QR format. Expected: name-phone" });
    }

    const name = parts[0];
    const phone = parts[1];

    console.log("Searching for customer:", { name, phone });

    // First, try to find customer in LoyalModel
    let user = await AdminLoyalModel.findOne({ name, phone });

    // If not found in LoyalModel, check BookingsModel
    if (!user) {
      console.log("Customer not found in LoyalModel, checking BookingsModel...");
      
      const bookingUser = await AdminBookModel.findOne({ name, phone });
      
      if (bookingUser) {
        console.log("Customer found in BookingsModel, creating in LoyalModel...");
        
        // Create customer in LoyalModel based on booking data
        user = new AdminLoyalModel({
          name: name,
          phone: phone,
          point: 150, // Start with 150 points as initial loyalty
          isLoyal: true,
          data: qrContent
        });
        
        await user.save();
        console.log("New loyal customer created from booking:", { name, phone });
      } else {
        console.log("Customer not found in any database");
        return res.status(404).json({ 
          valid: false,
          message: "Customer not found in database" 
        });
      }
    }

    // Return user data in the format expected by frontend
    return res.status(200).json({
      valid: true,
      customer: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        point: user.point || 150
      }
    });

  } catch (err) {
    console.error("QR Check Error:", err);
    return res.status(500).json({ 
      valid: false,
      error: "Internal Server Error" 
    });
  }
});

//@ts-ignore
routerss.get("/weekly-bookings", async (req, res) => {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6); // includes today

    const bookings = await AdminBookModel.find({
      preferred_date: {
        $gte: sevenDaysAgo.toISOString().split("T")[0],
        $lte: today.toISOString().split("T")[0],
      },
    });

    return res.status(200).json({ bookings });
  } catch (err) {
    console.error("Weekly booking fetch error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


//@ts-ignore
routerss.post("/done" , async(req,res)=>{
  try{
    const user = await AdminBookModel.findById(req.body.userId);
    user.done = true ; 
    await user.save();
  }
  catch (err) {
    console.error("Submission error", err);
    return res.status(500).json({ message: "Server error" });
  }
})

// FIXED: Add points route
//@ts-ignore
routerss.post("/add-points", async (req, res) => {
  try {
    //@ts-ignore
    const { userId, points, serviceAmount } = req.body;

    if (!userId || !points) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log("Adding points request:", { userId, points, serviceAmount });

    // Find the loyal customer
    const customer = await AdminLoyalModel.findById(userId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Add points (ensure point field exists, default to 0 if not)
    const currentPoints = parseInt(customer.point) || 0;
    const newPoints = currentPoints + parseInt(points);

    customer.point = newPoints;
    await customer.save();

    console.log(`Added ${points} points to ${customer.name}. New total: ${newPoints}`);

    return res.status(200).json({
      success: true,
      message: "Points added successfully",
      updatedPoints: newPoints,
      pointsAdded: points
    });

  } catch (err) {
    console.error("Add points error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

//@ts-ignore
//@ts-ignore
routerss.get("/loyalty-leaderboard", async (req, res) => {
  try {
    // Fetch all loyal customers and sort by points (highest first)
    const leaderboard = await AdminLoyalModel.find()
      .sort({ point: -1 }) // Sort descending by points
      .limit(50); // Limit to top 50 customers

    return res.status(200).json({ // Changed from 500 to 200
      success: true,
      leaderboard: leaderboard
    });

  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = routerss;