import prisma from "../lib/prismaClient.js";
import bcrypt from "bcryptjs";
import validator from "validator";
import { uploadToR2 } from "../config/cloudflareR2.js";

/**
 * ✅ Get the user's profile
 */
export const getUserProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        listings: {
          include: {
            images: true,
            favorites: true
          }
        }
      }
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Error fetching user profile" });
  }
};

/**
 * ✅ Update user profile
 */
export const updateProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const updates = {};

    const { email, username, password, bio } = req.body;

    if (email && !validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (email && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(400).json({ message: "Email already in use" });
      updates.email = email.trim();
    }

    if (username) updates.username = username.trim();
    if (bio) updates.bio = bio.trim();

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(password, salt);
    }

    if (req.file) {
      const result = await uploadToR2(req.file.path);
      if (result?.secure_url) {
        updates.profilePicture = result.secure_url;
      } else {
        return res.status(500).json({ message: "Failed to upload profile picture" });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Error updating profile" });
  }
};

/**
 * ✅ Get listings of current user
 */
export const getUserListings = async (req, res) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { userId: req.user.id },
      include: {
        images: true,
        favorites: true,
        category: true
      }
    });

    res.status(200).json({ listings });
  } catch (error) {
    console.error("Listings fetch error:", error);
    res.status(500).json({ message: "Error fetching user listings" });
  }
};

/**
 * ✅ Delete user and related data
 */
export const deleteUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Delete favorites, listings, etc. before user
    await prisma.favorite.deleteMany({ where: { userId: user.id } });
    await prisma.listing.deleteMany({ where: { userId: user.id } });

    await prisma.user.delete({ where: { id: user.id } });

    res.status(200).json({ message: "Account and listings deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Error deleting user" });
  }
};

/**
 * ✅ Get user settings
 */
export const getUserSettings = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { language: true, autoLocalization: true, country: true }
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    console.error("Fetch settings error:", error);
    res.status(500).json({ message: "Error fetching user settings" });
  }
};

/**
 * ✅ Update user settings
 */
export const updateUserSettings = async (req, res) => {
  try {
    const { language, autoLocalization, country } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        language,
        autoLocalization: Boolean(autoLocalization),
        country,
      }
    });

    res.status(200).json({ message: "Settings updated", user: updatedUser });
  } catch (error) {
    console.error("Settings update error:", error);
    res.status(500).json({ message: "Error updating settings" });
  }
};
