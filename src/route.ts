require("dotenv").config();
const mainRouter = require("../routes/index");
const cors = require("cors");
const express = require("express");
const { JWT_SECRET } = require("../config");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

console.log(JWT_SECRET);

app.get("/health", (req: any, res: any) => res.json({ status: "ok" }));
app.use("/api/v1/", mainRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
