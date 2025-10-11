const expresss = require("express");
const { z } = require("zod");
const { BookingsModels , LoyalModel } = require("../src/db");
const jwt = require("jsonwebtoken") ; 
const QRCode = require("qrcode");
require("dotenv").config() ; 
//const JWT_SECRETS  =  require("../config/JWT_SECRET") ;
const JWT_SECRETS = process.env.JWT_SECRET_KEY;
const {authMiddleware} = require("./middleware");
const routers = expresss.Router();
routers.use(expresss.json());
//@ts-ignore
function formatZodErrors(zodError) {
//@ts-ignore
  return zodError.errors.map((err) => ({
    [err.path[0]]: {
      _errors: [err.message],
    },
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
    const errors = formatZodErrors(result.error);
    return res.status(400).json(errors);
  }
  const { name, phone } = req.body;
  try {
    const loyal =await LoyalModel.findOne({name , phone}) ;
    const pointss = loyal?.point ?? 0; 
    const bookingData = {...result.data , isLoyal: loyal ? true : false, points : pointss} ; 
    const newBooking = new BookingsModels(bookingData);   
    await newBooking.save();
    return res.status(200).json({ message: "Booking successful!" });
  }  
  catch (err) {
    console.error("Error saving booking:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// Admin route - Get all bookings for a date
//@ts-ignore
routers.post("/all", async (req, res) => {
  try {
    const { date } = req.body;
    console.log("Fetching bookings for date:", date);
    
    const bookings = await BookingsModels.find({ preferred_date: date });
    
    return res.status(200).json({
      message: bookings
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

//@ts-ignore
routers.post("/done", async (req, res) => {
  try {
    const { userId } = req.body;
    
    const booking = await BookingsModels.findByIdAndUpdate(
      userId, 
      { done: true }, 
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    
    return res.status(200).json({ 
      message: "Booking marked as done",
      booking 
    });
  } catch (error) {
    console.error("Error updating booking:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin route - Get weekly bookings analytics
//@ts-ignore
routers.get("/weekly-bookings", async (req, res) => {
  try {
    // Get bookings from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const bookings = await BookingsModels.find({
      preferred_date: { 
        $gte: sevenDaysAgo.toISOString().split('T')[0] 
      }
    });
    
    return res.status(200).json({ bookings });
  } catch (error) {
    console.error("Error fetching weekly bookings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


//@ts-ignore
routers.post("/loyal", async (req, res) => {
  const result = loyalSchema.safeParse(req.body);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    return res.status(400).json(errors);
  }

  try {
    const { name, phone, email } = req.body;

    let existingUser = await LoyalModel.findOne({ name, phone, email });

    console.log("user");
    console.log(existingUser);
    if (!existingUser) {
      const qrPayload = `${name}-${phone}`;
      console.log("Actual QR payload!!");
      console.log(qrPayload);
      const qrData = jwt.sign({
        qrPayload
      },
        JWT_SECRETS,
        { noTimestamp: true }
      )
      // ✅ Fix: Generate QR image from JWT token, not raw payload
      const qrImage = await QRCode.toDataURL(qrData);

      const newLoyal = new LoyalModel({
        name,
        phone,
        email,
        point: "150",
        data: qrData,
        qrImage,
        reviewSubmitted: false // Initialize as false
      });
      await newLoyal.save();

      const userId = newLoyal._id;
      const token = jwt.sign(
        {
          userId
        },
        JWT_SECRETS
      );
      return res.status(200).json({
        message: "Now a loyal customer!",
        imp: token,
        qrImage,
        points: "150",
      });
    } else {
      const userId = existingUser._id;
      const token = jwt.sign(
        {
          userId
        },
        JWT_SECRETS
      );
      return res.status(200).json({
        message: "Already a loyal customer!.",
        imp: token,
        points: existingUser.point,
        qrImage: existingUser.qrImage,
      });
    }
  } catch (err) {
    console.error("Error saving loyal data:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


//@ts-ignore
routers.get("/loyal_name", authMiddleware , async(req,res) => {
    if (!req.userId) {
    res.status(411).json("Token is not entered");
  } else {
    const name = await LoyalModel.findOne({
      _id: req.userId,
    });
    res.json({
      name
    });
  }
})

//@ts-ignore
routers.post("/submit-review-proof", authMiddleware, async (req, res) => {
  try {
    const user = await LoyalModel.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.reviewSubmitted) {
      return res.status(400).json({ message: "Review already submitted" });
    }

    user.point = (parseInt(user.point) + 500).toString();
    user.reviewSubmitted = true;
    await user.save();

    return res.status(200).json({ 
      message: "Points updated and review marked.",
      pointsAdded: 50
    });
  } catch (err) {
    console.error("Review proof submission failed:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

//@ts-ignore
routers.post("/check", async (req, res) => {
  try {
    const { qrContent } = req.body;
    
    if (!qrContent) {
      return res.status(400).json({ 
        valid: false, 
        message: "QR content is required" 
      });
    }

    console.log("Received QR content:", qrContent);

    // Try to verify if it's a JWT token first
    try {
      const decoded = jwt.verify(qrContent, JWT_SECRETS);
      console.log("JWT decoded:", decoded);
      
      // If it's JWT, extract the payload
      if (decoded.qrPayload) {
        const [name, phone] = decoded.qrPayload.split('-');
        console.log("Extracted from JWT - Name:", name, "Phone:", phone);
        
        const customer = await LoyalModel.findOne({ name, phone });
        if (customer) {
          return res.status(200).json({
            valid: true,
            customer: {
              _id: customer._id,
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              point: customer.point,
              reviewSubmitted: customer.reviewSubmitted || false
            }
          });
        }
      }
    } catch (jwtError) {
      //@ts-ignore
      console.log("Not a valid JWT, trying direct payload search:", jwtError.message);
    }

    // If JWT verification fails, try direct payload search (name-phone format)
    if (qrContent.includes('-')) {
      const [name, phone] = qrContent.split('-');
      console.log("Direct search - Name:", name, "Phone:", phone);
      
      const customer = await LoyalModel.findOne({ name, phone });
      if (customer) {
        return res.status(200).json({
          valid: true,
          customer: {
            _id: customer._id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            point: customer.point,
            reviewSubmitted: customer.reviewSubmitted || false
          }
        });
      }
    }

    // If no customer found
    return res.status(404).json({
      valid: false,
      message: "Customer not found or invalid QR code"
    });

  } catch (error) {
    console.error("QR verification error:", error);
    return res.status(500).json({
      valid: false,
      message: "Server error during QR verification"
    });
  }
});

//@ts-ignore
routers.post("/add-points", async (req, res) => {
  try {
    const { userId, points, serviceAmount } = req.body;
    
    if (!userId || !points) {
      return res.status(400).json({ 
        error: "User ID and points are required" 
      });
    }

    const customer = await LoyalModel.findById(userId);
    if (!customer) {
      return res.status(404).json({ 
        error: "Customer not found" 
      });
    }

    // Add points to existing points
    const currentPoints = parseInt(customer.point) || 0;
    const newPoints = currentPoints + parseInt(points);
    
    // Reset reviewSubmitted to false when points are added (new service taken)
    customer.point = newPoints.toString();
    customer.reviewSubmitted = false; // Reset review eligibility for new service
    await customer.save();

    console.log(`Added ${points} points to ${customer.name}. New total: ${newPoints}. Review eligibility reset.`);

    return res.status(200).json({
      message: "Points added successfully",
      updatedPoints: newPoints,
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        point: customer.point,
        reviewSubmitted: customer.reviewSubmitted
      }
    });

  } catch (error) {
    console.error("Add points error:", error);
    return res.status(500).json({
      error: "Server error while adding points"
    });
  }
});


module.exports = routers;