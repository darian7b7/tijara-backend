import mongoose from "mongoose";
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  upload,
  uploadToR2,
  processImage,
  processImagesMiddleware,
} from "../middleware/upload.middleware.js";
import {
  createListing,
  getListings,
  getListingById,
  updateListing,
  deleteListing,
  getUserListings,
  getTrendingListings,
  searchListings,
} from "../controllers/listing.controller.js";
import Listing from "../models/listing.model.js";

const router = express.Router();

// Public Routes
router.get("/", getListings);
router.get("/search", searchListings);
router.get("/trending", getTrendingListings);

// Protected Routes
router.use(protect);

// Order matters! Put specific routes before parameterized routes
router.get("/saved", async (req, res) => {
  try {
    const userId = req.user._id;
    const savedListings = await Listing.find({ savedBy: userId })
      .populate("seller", "username profilePicture")
      .lean();

    res.json({
      success: true,
      data: {
        items: savedListings,
        totalItems: savedListings.length,
        page: 1,
        limit: savedListings.length,
        hasMore: false
      }
    });
  } catch (error) {
    console.error("Error fetching saved listings:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error fetching saved listings",
      data: null
    });
  }
});

// Get user's listings
router.get("/user", getUserListings);

router.post("/", upload.array("images"), processImagesMiddleware, createListing);
router.put("/:id", upload.array("images"), processImagesMiddleware, updateListing);
router.delete("/:id", deleteListing);

// Get listing by ID - Move this after specific routes
router.get("/:id", getListingById);

// Toggle save status
router.post("/:id/toggle-save", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid listing ID",
        data: null
      });
    }

    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ 
        success: false,
        error: "Listing not found",
        data: null
      });
    }

    const isSaved = listing.savedBy.includes(userId);
    if (isSaved) {
      listing.savedBy = listing.savedBy.filter(
        (id) => id.toString() !== userId.toString(),
      );
    } else {
      listing.savedBy.push(userId);
    }

    await listing.save();
    res.json({
      success: true,
      data: {
        saved: !isSaved,
        listing: isSaved ? null : listing
      }
    });
  } catch (error) {
    console.error("Error toggling save status:", error);
    res.status(500).json({ 
      success: false,
      error: "Error updating saved status",
      data: null
    });
  }
});

const formatListingResponse = (listing) => {
  const formatted = { ...listing };
  formatted.price = parseFloat(listing.price).toLocaleString();

  ["size", "bedrooms", "bathrooms", "mileage"].forEach((field) => {
    if (listing.details[field]) {
      formatted.details[field] = parseFloat(listing.details[field]);
    }
  });

  return formatted;
};

export default router;
