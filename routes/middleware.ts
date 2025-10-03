require("dotenv").config();
const jwt = require("jsonwebtoken");
const JWT_SECRETSS = process.env.JWT_SECRET_KEY;

//@ts-ignore
export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No or invalid Authorization header!" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRETSS);
        req.userId = decoded.userId; 
        next();
    } catch (err) {
        return res.status(403).json({ message: "Token is incorrect!" });
    }
}
