import mongoose , {model , Schema} from "mongoose" ;
mongoose.connect(process.env.MONGO_URI || "mongodb://SatyamDB:xxUo2yUsh1mJC36N@cluster0-shard-00-00.sdy3k.mongodb.net:27017,cluster0-shard-00-01.sdy3k.mongodb.net:27017,cluster0-shard-00-02.sdy3k.mongodb.net:27017/Barber?replicaSet=atlas-z8quws-shard-0&ssl=true&authSource=admin")
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
    qrImage: { type: String, default: "" },
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
