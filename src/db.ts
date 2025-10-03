import mongoose , {model , Schema} from "mongoose" ; 
mongoose.connect("mongodb+srv://SatyamDB:xxUo2yUsh1mJC36N@cluster0.sdy3k.mongodb.net/Barber");
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://SatyamDB:xxUo2yUsh1mJC36N@cluster0.sdy3k.mongodb.net/Barber")
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.log("DB Connection Error:", err));

const BookingsSchema = new Schema ({
    name : {type : String} ,
    email : {type :String} ,
    phone : {type : String} , 
    service : {type :String} ,
    preferred_date : {type : String} , 
    preferred_time :{type:String} ,
    done:{type:Boolean , default: false},
    isLoyal : {type:Boolean , default : false},
    points :{type:String , default:0}
})

export const BookingsModels = model("FullFinalBooking", BookingsSchema) ; 

const LoyalSchema = new Schema({
    name : {type : String} ,
    email : {type :String} ,
    phone : {type : String} ,
    point : {type :String , default:0}  ,
    data: { type: String, required: true },
    qrImage: { type: String, required: true }, 
    reviewSubmitted: { type: Boolean, default: false }
})

export const LoyalModel = model("Loyalsss", LoyalSchema) ;
LoyalSchema.index({ name: 1, phone: 1, email: 1 }, { unique: true })

const AdminSchema = new Schema({
    name : {type:String} ,
    phone : {type:String} ,
    password : {type:String}
})

export const AdminModel = model("Admin", AdminSchema) ;

