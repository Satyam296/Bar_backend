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
//@ts-ignore
routerss.post("/check", async (req, res) => {
  const qrContent = req.body.qrContent;
  if (!qrContent) {
    return res.status(400).json({ 
      valid: false,
      message: "QR content is required" 
    });
  }

  try {
    console.log("Received QR content:", qrContent);

    let decodedPayload;
    
    // Try to decode as JWT token first
    try {
      const decoded = jwts.verify(qrContent, JWT_SECRETSS);
      console.log("JWT decoded successfully:", decoded);
      
      if (decoded.qrPayload) {
        decodedPayload = decoded.qrPayload;
      } else {
        // If no qrPayload, try to use the raw content as payload
        decodedPayload = qrContent;
      }
    } catch (jwtError) {
      // If JWT verification fails, use raw content directly
      //@ts-ignore
      console.log("Not a valid JWT, using raw content:", jwtError.message);
      decodedPayload = qrContent;
    }

    console.log("Final payload to search:", decodedPayload);

    // Parse the payload (expected format: "name-phone")
    if (decodedPayload.includes('-')) {
      const [name, phone] = decodedPayload.split('-');
      console.log("Searching for customer:", { name, phone });

      // Search in LoyalModel first
      let customer = await AdminLoyalModel.findOne({ name, phone });
      
      if (customer) {
        console.log("Customer found in loyal database");
        return res.status(200).json({
          valid: true,
          customer: {
            _id: customer._id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            point: customer.point || 0
          }
        });
      }

      // If not found in LoyalModel, check BookingsModel
      console.log("Customer not found in loyal database, checking bookings...");
      const bookingCustomer = await AdminBookModel.findOne({ name, phone });
      
      if (bookingCustomer) {
        console.log("Customer found in bookings, creating loyal customer...");
        
        // Create new loyal customer from booking data
        const newLoyalCustomer = new AdminLoyalModel({
          name: name,
          phone: phone,
          email: bookingCustomer.email || "",
          point: 150, // Initial points
          isLoyal: true,
          data: qrContent
        });
        
        await newLoyalCustomer.save();
        console.log("New loyal customer created");

        return res.status(200).json({
          valid: true,
          customer: {
            _id: newLoyalCustomer._id,
            name: newLoyalCustomer.name,
            phone: newLoyalCustomer.phone,
            email: newLoyalCustomer.email,
            point: newLoyalCustomer.point
          }
        });
      }
    }

    // If no customer found
    console.log("Customer not found in any database");
    return res.status(404).json({
      valid: false,
      message: "Customer not found in database"
    });

  } catch (error) {
    console.error("QR Check Error:", error);
    return res.status(500).json({
      valid: false,
      message: "Server error during QR verification"
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

// // @ts-ignore
// routerss.post("/check", async (req, res) => {
//   const tokenScanned = req.body.qrContent;
//   if (!tokenScanned) {
//     return res.status(400).json({ error: "QR content is required" });
//   }

//   try {
//     // 1️⃣ Try to verify the QR token
//     let payload;
//     try {
//       const decoded = jwts.verify(tokenScanned, JWT_SECRETSS);
//       payload = decoded.qrPayload;
//     } catch (err) {
//       // not a valid token – fallback
//       //@ts-ignore
//        console.warn("Invalid or unverified QR token:", err.message);
//       payload = tokenScanned;
//     }

//     // 2️⃣ Extract name and phone
//     const [name, phone] = payload.split("-");

//     if (!name || !phone) {
//       return res.status(400).json({ error: "Invalid QR format" });
//     }

//     // 3️⃣ Find the customer
//     const user = await AdminLoyalModel.findOne({ name, phone });

//     if (!user) {
//       return res.status(404).json({ message: "Customer not found" });
//     }

//     // 4️⃣ Success
//     return res.status(200).json({
//       message: "QR code verified successfully",
//       user,
//     });
//   } catch (err) {
//     console.error("QR Check Error:", err);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

//@ts-ignore
//@ts-ignore
routerss.post("/add-points", async (req, res) => {
  try {
    //@ts-ignore
    const { userId, points } = req.body;

    if (!userId || !points) {
      return res.status(400).json({ error: "Missing required fields" });
    }

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
routerss.get("/loyalty-leaderboard", async (req, res) => {
  //@ts-ignore
  try {
    // Fetch all loyal customers and sort by points (highest first)
    const leaderboard = await AdminLoyalModel.find()
      .sort({ point: -1 }) // Sort descending by points
      .limit(50); // Limit to top 50 customers

    return res.status(200).json({
      success: true,
      leaderboard: leaderboard
    });

  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
module.exports = routerss;
