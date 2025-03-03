import express from "express";
import { body } from "express-validator";
import { protect } from "../middleware/auth.js";
import { getMe, login, register, logout } from "../controllers/auth.controller.js";

const router = express.Router();

// ✅ Register Route with Validation
router.post(
  "/register",
  [
    body("username").trim().notEmpty().withMessage("Username is required"),
    body("email").isEmail().withMessage("Please enter a valid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  register
);

// ✅ Login Route with Validation
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please enter a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  login
);

// ✅ Logout Route (Clears HTTP-only cookie)
router.post("/logout", logout);

// ✅ Get Authenticated User Info (Protected)
router.get("/me", protect, getMe);

export default router;
