import User from "../models/user.model.js";
import { uploadToR2, deleteFromR2 } from "../config/cloudflareR2.js";
import bcrypt from "bcryptjs";
import validator from "validator";
import Listing from "../models/listing.model.js"; // Ensure .js is included

/**
 * ✅ Get the user's profile
 */
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching user profile", error: error.message });
  }
};

/**
 * ✅ Update the user's profile
 */
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Validate email format if changed
    if (req.body.email && !validator.isEmail(req.body.email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // ✅ Validate password strength if changed
    if (req.body.password && req.body.password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // ✅ Update fields if provided
    user.username = req.body.username?.trim() || user.username;
    user.email = req.body.email?.trim() || user.email;
    user.bio = req.body.bio?.trim() || user.bio;

    // ✅ Hash new password if provided
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.password, salt);
    }

    // ✅ Upload profile picture if provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file.path);
      if (result?.secure_url) {
        user.profilePicture = result.secure_url;
      } else {
        return res
          .status(500)
          .json({ message: "Error uploading profile picture" });
      }
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      profilePicture: updatedUser.profilePicture,
      bio: updatedUser.bio,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating profile", error: error.message });
  }
};

/**
 * ✅ Get all listings by the authenticated user
 */
export const getUserListings = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    console.log("Fetching listings for user:", req.user._id);

    const listings = await Listing.find({ seller: req.user._id }).populate(
      "seller",
      "username email",
    );

    console.log("Listings found:", listings);

    if (!listings.length) {
      return res
        .status(200)
        .json({ message: "No listings found", listings: [] });
    }

    res.json({ listings });
  } catch (error) {
    console.error("Error fetching user listings:", error);
    res.status(500).json({ message: "Server error fetching listings" });
  }
};

/**
 * ✅ Delete a user account
 */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Delete all listings associated with the user
    await Listing.deleteMany({ seller: req.user._id });

    // ✅ Delete user account
    await User.findByIdAndDelete(req.user._id);

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting account", error: error.message });
  }
};

/**
 * ✅ Get User Settings (e.g., Language Preferences)
 */
export const getUserSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("preferences");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user.preferences);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving settings", error: error.message });
  }
};

/**
 * ✅ Update User Settings (e.g., Language, Notifications)
 */
export const updateUserSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.language = req.body.language || user.language;
    user.autoLocalization = req.body.autoLocalization || user.autoLocalization;
    user.country = req.body.country || user.country;

    await user.save();
    res.json({ message: "Settings updated successfully", user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating settings", error: error.message });
  }
};
