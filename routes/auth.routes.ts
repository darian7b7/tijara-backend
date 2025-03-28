import express, { Request, Response, NextFunction } from "express";
import { body } from "express-validator";
import { protect } from "../middleware/auth.js";
import {
  getMe,
  login,
  register,
  logout,
} from "../controllers/auth.controller.js";
import { validateRegistration, validate } from "../middleware/validation.middleware.js";
import { loginLimiter } from "../middleware/auth.js";

const router = express.Router();

// Type-safe request handler wrapper
const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Registration validation middleware
const registerValidation = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email"),
  body("username")
    .trim()
    .isLength({ min: 3 })
    .withMessage("Username must be at least 3 characters long"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),
];

// Register Route with Validation
router.post(
  "/register",
  registerValidation,
  asyncHandler(register)
);

// Login Route with Validation and Rate Limiting
router.post(
  "/login",
  loginLimiter,
  [
    body("email").isEmail().withMessage("Please enter a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  asyncHandler(login)
);

// Logout Route
router.post("/logout", asyncHandler(logout));

// Get Authenticated User Info (Protected)
router.get("/me", protect, asyncHandler(getMe));

export default router;
