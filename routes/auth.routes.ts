import express from "express";
import { login, register, logout, getMe, refreshToken } from "../controllers/auth.controller.js";
import { validateRegistration, validate } from "../middleware/validation.middleware.js";
import { loginLimiter, authenticate } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/register", validateRegistration, validate, register);
router.post("/login", loginLimiter, login);
router.post("/refresh", refreshToken);

// Protected routes
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, getMe);

export default router;
