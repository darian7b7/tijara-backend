import express from "express";
import { protect } from "../middleware/auth.js";
import { PrismaClient } from "@prisma/client";
import {
  updateProfile,
  getUserProfile,
  getUserSettings,
  updateUserSettings,
  getUserListings,
} from "../controllers/user.controller.js";
import {
  upload,
  processImage,
  uploadToR2,
} from "../middleware/upload.middleware.js";

const prisma = new PrismaClient();
const router = express.Router();

// Middleware to process profile picture
const processProfilePicture = async (req, res, next) => {
  try {
    if (req.file) {
      // Upload processed image to R2
      req.body.profilePicture = await uploadToR2(req.file, "avatar");
    }
    next();
  } catch (error) {
    next(error);
  }
};

// ✅ Ensure all routes require authentication
router.use(protect);

// ✅ Get user profile
router.get("/profile", getUserProfile);

// ✅ Update profile (optional profile picture upload)
router.put(
  "/profile",
  upload.single("profilePicture"),
  processProfilePicture,
  updateProfile,
);

// ✅ Get user settings
router.get("/settings", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: "preferences" });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Initialize preferences if they don't exist
    if (!user.preferences) {
      user.preferences = { language: "en" };
      await user.save();
    }

    res.json(user);
  } catch (error) {
    console.error("Error getting settings:", error);
    res.status(500).json({ message: "Error retrieving settings" });
  }
});

// ✅ Update settings
router.post("/settings", async (req, res) => {
  try {
    const { preferences } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Initialize preferences if they don't exist
    if (!user.preferences) {
      user.preferences = {};
    }

    // Update preferences
    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
    }

    await user.save();
    res.json({
      message: "Settings updated successfully",
      preferences: user.preferences,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ message: "Server error updating settings" });
  }
});

// Get user's listings
router.get("/listings", getUserListings);

export default router;
