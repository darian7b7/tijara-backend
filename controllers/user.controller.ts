import { Response } from "express";
import prisma from "../lib/prismaClient.js";
import bcrypt from "bcryptjs";
import validator from "validator";
import { uploadToR2 } from "../config/cloudflareR2.js";
import { Prisma, User } from "@prisma/client";
import {
  AuthRequest,
  UserPreferences,
  InputJsonValue,
} from "../types/index.js";

interface UpdateData {
  email?: string;
  username?: string;
  password?: string;
  bio?: string;
  profilePicture?: string;
  preferences?: Prisma.InputJsonValue;
}

interface UploadResult {
  url: string;
}

// Define type for user with preferences
type UserWithPreferences = User & {
  preferences: UserPreferences | null;
};

/**
 * ✅ Get the user's profile
 */
export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        listings: {
          include: {
            images: true,
            favorites: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        status: 404,
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      data: user,
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({
      success: false,
      error: "Error fetching user profile",
      status: 500,
      data: null,
    });
  }
};

/**
 * ✅ Update user profile
 */
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        status: 404,
        data: null,
      });
    }

    const updates: UpdateData = {};

    const { email, username, password, bio } = req.body;

    if (email && !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
        status: 400,
        data: null,
      });
    }

    if (email && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: "Email already in use",
          status: 400,
          data: null,
        });
      }
      updates.email = email.trim();
    }

    if (username) updates.username = username.trim();
    if (bio) updates.bio = bio.trim();

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: "Password must be at least 6 characters",
          status: 400,
          data: null,
        });
      }
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(password, salt);
    }

    if (req.file) {
      try {
        const uploadResult = await uploadToR2(req.file, "profilePictures");
        updates.profilePicture = uploadResult;
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: "Failed to upload profile picture",
          status: 500,
          data: null,
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
    });

    res.status(200).json({
      success: true,
      data: updatedUser,
      status: 200,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({
      success: false,
      error: "Error updating profile",
      status: 500,
      data: null,
    });
  }
};

/**
 * ✅ Get listings of current user
 */
export const getUserListings = async (req: AuthRequest, res: Response) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { userId: req.user.id },
      include: {
        images: true,
        favorites: true,
      },
    });

    res.status(200).json({
      success: true,
      data: { listings },
      status: 200,
    });
  } catch (error) {
    console.error("Listings fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Error fetching user listings",
      status: 500,
      data: null,
    });
  }
};

/**
 * ✅ Delete user and related data
 */
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user)
      return res
        .status(404)
        .json({ success: false, error: "User not found", status: 404 });

    // Delete favorites, listings, etc. before user
    await prisma.favorite.deleteMany({ where: { userId: user.id } });
    await prisma.listing.deleteMany({ where: { userId: user.id } });

    await prisma.user.delete({ where: { id: user.id } });

    res
      .status(200)
      .json({
        success: true,
        data: { message: "Account and listings deleted successfully" },
        status: 200,
      });
  } catch (error) {
    console.error("Delete error:", error);
    res
      .status(500)
      .json({ success: false, error: "Error deleting user", status: 500 });
  }
};

/**
 * ✅ Get user settings
 */
export const getUserSettings = async (req: AuthRequest, res: Response) => {
  try {
    const user = (await prisma.user.findUnique({
      where: { id: req.user.id },
    })) as UserWithPreferences;

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        status: 404,
        data: null,
      });
    }

    // Initialize default preferences
    const defaultPreferences: UserPreferences = {
      language: "en",
      theme: "light",
      notifications: {
        enabledTypes: [],
        emailNotifications: true,
        pushNotifications: true,
      },
      emailPreferences: {
        newMessages: true,
        listingUpdates: true,
        promotions: false,
      },
      autoLocalization: true,
    };

    // Use the stored preferences or default ones
    const userPreferences = user.preferences || defaultPreferences;

    res.status(200).json({
      success: true,
      data: { preferences: userPreferences },
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    res.status(500).json({
      success: false,
      error: "Error fetching user settings",
      status: 500,
      data: null,
    });
  }
};

/**
 * ✅ Update user settings
 */
export const updateUserSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { preferences } = req.body as { preferences: UserPreferences };

    // Validate preferences structure
    if (!preferences || typeof preferences !== "object") {
      return res.status(400).json({
        success: false,
        error: "Invalid preferences format",
        status: 400,
        data: null,
      });
    }

    // Convert preferences to Prisma.JsonValue
    const preferencesJson = JSON.parse(
      JSON.stringify(preferences),
    ) as unknown as Prisma.JsonValue;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        preferences: preferencesJson as Prisma.InputJsonValue,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        preferences: updatedUser.preferences,
      },
      status: 200,
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({
      success: false,
      error: "Error updating user settings",
      status: 500,
      data: null,
    });
  }
};
