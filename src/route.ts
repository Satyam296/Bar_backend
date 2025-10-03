const mainRouter = require("../routes/index");
const cors = require("cors");
const express = require("express");
const { JWT_SECRET } = require("../config");

const app = express();

app.use(cors());
app.use(express.json());

console.log(JWT_SECRET);

app.use("/api/v1/", mainRouter);

app.listen(3001, () => {
  console.log("Server running on port 3001");
});
