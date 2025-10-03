const expresssi = require("express");
const routerss = expresssi.Router();
const { z:myZod } = require("zod");
routerss.use(expresssi.json());
const {AdminModel} = require("../src/db");
const { LoyalModel: AdminLoyalModel} = require("../src/db");
const {BookingsModels : AdminBookModel} = require("../src/db") ; 
require("dotenv").config() ; 
const Shop_Password = process.env.Shop_Password;
const jwts = require("jsonwebtoken") ; 
const JWT_SECRETSS = process.env.JWT_SECRET_KEY;
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

routerss.use(expresssi.json({ limit: '2mb' })); // or more if needed
routerss.use(expresssi.urlencoded({ extended: true, limit: '2mb' }));

//@ts-ignore
routerss.post("/signin", async(req,res) => {
  const result = AdminSchema.safeParse(req.body);
  if (!result.success) {
    const errors = formatZodErrors(result.error);
    return res.status(400).json(errors);
  }

  try {
    const { name, email, phone ,password } = req.body;
    console.log(password) ;
    console.log(Shop_Password)
    if(password === Shop_Password) {
    let existingUser = await AdminModel.findOne({ name, phone });
    if(!existingUser){
      const newAdmin = new AdminModel({
        name ,
        email ,
        phone, 
        password
      }) ;
      await newAdmin.save() ; 
      const userId = newAdmin._id ;    
      const token = jwts.sign(
        {
          userId
        },
        JWT_SECRETSS
      );

      return res.status(200).json({
        message: "Admin Logged in!",
        imp : token ,
      })}
    else {
      const userId = existingUser._id;
      const token = jwts.sign(
        {
          userId
        },
        JWT_SECRETSS
      );
      return res.status(200).json({
        message: "Admin Logged in!",
        imp : token 
      });
    }} 
    else{
      return res.status(500).json({ error: "Enter the correct password!!!" });
    }
   }catch (err) {
     console.error("Error saving admin data:", err);
     return res.status(500).json({ error: "Internal server error" });
   }
 } 
)

//@ts-ignore 
routerss.post("/all", async (req, res) => {
  const date = req.body.date;
  try {
    const all = await AdminBookModel.find({
      preferred_date: date
    });

    if (all.length === 0) {
      res.json({ message: "No users yet!" });
    } else {
      res.json({ message: all });
    }
  } catch (error) {
    console.error("Error fetching this day bookings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//@ts-ignore
routerss.post("/check", async (req, res) => {
  const rawData = req.body.qrContent;
  if (!rawData) {
    return res.status(400).json({ error: "QR content is required" });
  }

  try {
    const allUsers = await AdminLoyalModel.find(); 

    for (const user of allUsers) {
      try {
        const decoded = jwts.verify(user.data, JWT_SECRETSS); 
        const payload = decoded.qrPayload;

        if (payload === rawData) {
          const currentPoints = parseInt(user.point) || 0;
          user.point = String(currentPoints + 150);
          await user.save();

          return res.status(200).json({
            message: "Loyalty verified and updated",
            user,
          });
        }
      } catch (err) {
        //@ts-ignore 
        console.warn("Skipping invalid token:", err.message);
        continue;
      }
    }

    return res.status(404).json({ message: "QR not found" });

  } catch (err) {
    console.error("QR Check Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
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


module.exports = routerss;
