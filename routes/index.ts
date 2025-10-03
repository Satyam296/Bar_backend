const expressi = require("express");
const userRouter = require("./user");
const adminRouter = require("./admin");

const router = expressi.Router();

router.use("/user", userRouter);
router.use("/admin", adminRouter);

module.exports = router;
