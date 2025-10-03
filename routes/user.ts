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

//@ts-ignore
routers.post("/loyal", async (req, res) => {
  const result = loyalSchema.safeParse(req.body);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    return res.status(400).json(errors);
  }

  try {
    const { name, phone, email } = req.body;

    let existingUser = await LoyalModel.findOne({ name , phone, email });

    console.log("user") ; 
    console.log(existingUser) ; 
    if (!existingUser) {
      const qrPayload = `${name}-${phone}`;
      console.log("Actual QR payload!!"); 
      console.log(qrPayload) ; 
      const qrData = jwt.sign({
        qrPayload
      },
    JWT_SECRETS ,
    { noTimestamp: true }
    )
      const qrImage = await QRCode.toDataURL(qrPayload);

      const newLoyal = new LoyalModel({
        name,
        phone,
        email,
        point: "150", 
        data: qrData,
        qrImage,
      });

      await newLoyal.save();

      const userId = newLoyal._id ;    
      const token = jwt.sign(
        {
          userId
        },
        JWT_SECRETS
      );

      return res.status(200).json({
        message: "Now a loyal customer!",
        imp : token ,
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
        imp : token , 
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

    user.point = (parseInt(user.point) + 200).toString();
    user.reviewSubmitted = true;
    await user.save();

    return res.status(200).json({ message: "Points updated and review marked." });
  } catch (err) {
    console.error("Review proof submission failed:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = routers; 