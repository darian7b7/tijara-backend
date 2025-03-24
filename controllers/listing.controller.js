import Listing from "../models/listing.model.js"; // Note the .js extension
import { uploadToR2, deleteFromR2 } from "../config/cloudflareR2.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createNotification } from "./notification.controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const formatListingResponse = (listing) => {
  if (!listing) return null;
  const formatted = listing.toObject ? listing.toObject() : { ...listing };
  return {
    ...formatted,
    id: formatted._id.toString(),
    seller: formatted.seller ? {
      id: formatted.seller._id?.toString(),
      username: formatted.seller.username,
      profilePicture: formatted.seller.profilePicture,
    } : null,
  };
};

const validateListingData = (data, step = 6) => {
  const errors = [];

  if (step >= 1 && !data.mainCategory) {
    errors.push("Main category is required");
  }

  if (step >= 2) {
    if (!data.title?.trim()) errors.push("Title is required");
    if (!data.category) errors.push("Category is required");
  }

  if (step >= 3) {
    if (!data.price) errors.push("Price is required");
    if (!data.location?.trim()) errors.push("Location is required");
  }

  if (step >= 4) {
    const requiredFields = {
      vehicles: ["make", "model", "year", "fuelType", "transmission"],
      "real-estate": ["propertyType", "size", "bedrooms", "bathrooms"],
    };

    const categoryFields = requiredFields[data.mainCategory] || [];
    const missingFields = categoryFields.filter(field => !data.details?.[field]);

    if (missingFields.length > 0) {
      errors.push(`Missing required fields: ${missingFields.join(", ")}`);
    }
  }

  if (step >= 5 && (!data.images || data.images.length === 0)) {
    errors.push("At least one image is required");
  }

  return errors;
};

export const createListing = async (req, res) => {
  try {
    console.log("Received files:", req.files?.length);
    console.log("Received body:", req.body);

    // Parse details if it's a string
    let details = {};
    try {
      details = req.body.details ? JSON.parse(req.body.details) : {};
    } catch (error) {
      console.error("Error parsing details:", error);
      return res.status(400).json({
        success: false,
        error: "Invalid details format",
        data: null
      });
    }

    // Parse features if present
    let features = [];
    try {
      features = req.body.features ? JSON.parse(req.body.features) : [];
    } catch (error) {
      console.error("Error parsing features:", error);
      return res.status(400).json({
        success: false,
        error: "Invalid features format",
        data: null
      });
    }

    // Validate required fields
    if (!req.body.title?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Title is required",
        data: null
      });
    }
    if (!req.body.description?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Description is required",
        data: null
      });
    }
    if (!req.body.price) {
      return res.status(400).json({
        success: false,
        error: "Price is required",
        data: null
      });
    }
    if (!req.body.category?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Category is required",
        data: null
      });
    }
    if (!req.body.location?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Location is required",
        data: null
      });
    }

    // Upload images to R2
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        imageUrls = await Promise.all(
          req.files.map(file => uploadToR2(file, "listings"))
        );
      } catch (error) {
        console.error("Error uploading images:", error);
        return res.status(500).json({
          success: false,
          error: "Failed to upload images",
          data: null
        });
      }
    }

    // Create listing
    const listing = new Listing({
      title: req.body.title,
      description: req.body.description,
      price: parseFloat(req.body.price),
      category: req.body.category,
      location: req.body.location,
      details: details,
      images: imageUrls,
      seller: req.user._id,
      features: features
    });

    await listing.save();

    // Create notification for the listing
    await createNotification(
      req.app.get("io"),
      listing.seller._id,
      "save",
      listing._id,
      `Your listing "${listing.title}" has been created successfully.`,
      "New Listing Created"
    );

    res.status(201).json({
      success: true,
      data: formatListingResponse(listing),
      message: "Listing created successfully"
    });
  } catch (error) {
    console.error("Error creating listing:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Error creating listing",
      data: null
    });
  }
};

export const getListings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const { category, search, sort = "latest" } = req.query;

    const query = {};
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {
      latest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      views_desc: { views: -1 },
    }[sort] || { createdAt: -1 };

    const [listings, total] = await Promise.all([
      Listing.find(query)
        .populate("seller", "username profilePicture")
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Listing.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        items: listings.map(formatListingResponse),
        total,
        page,
        limit,
        hasMore: total > page * limit,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch listings",
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 12,
        hasMore: false,
      },
    });
  }
};

export const searchListings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const {
      q: searchQuery,
      category,
      minPrice,
      maxPrice,
      sortBy = "relevance",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Build search query
    if (searchQuery) {
      query.$or = [
        { title: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } },
      ];
    }

    // Apply filters
    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Determine sort options
    const sortOptions = {
      relevance: searchQuery ? { score: { $meta: "textScore" } } : { createdAt: -1 },
      price: { price: sortOrder === "desc" ? -1 : 1 },
      date: { createdAt: sortOrder === "desc" ? -1 : 1 },
    }[sortBy] || { createdAt: -1 };

    const [listings, total] = await Promise.all([
      Listing.find(query)
        .populate("seller", "username profilePicture")
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Listing.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        items: listings.map(formatListingResponse),
        total,
        page,
        limit,
        hasMore: total > page * limit,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error searching listings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search listings",
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 12,
        hasMore: false,
      },
    });
  }
};

export const getListingById = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate("seller", "username profilePicture")
      .lean();

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found",
      });
    }

    // Increment views
    await Listing.findByIdAndUpdate(req.params.id, {
      $inc: { views: 1 },
      $set: { updatedAt: new Date() },
    });

    // Create notification for listing owner about the view
    if (req.user && req.user._id.toString() !== listing.seller._id.toString()) {
      await createNotification(
        req.app.get("io"),
        listing.seller._id,
        "view",  // Changed from "listing" to "view" to match schema
        listing._id,
        `Someone viewed your listing: ${listing.title}`,
        "New View"
      );
    }

    res.json({
      success: true,
      data: formatListingResponse(listing),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching listing:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch listing",
    });
  }
};

export const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findOne({
      _id: req.params.id,
      seller: req.user._id,
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found or unauthorized",
      });
    }

    // Handle image uploads if any
    let imageUrls = listing.images || [];
    if (req.files?.length > 0) {
      const newImageUrls = await Promise.all(
        req.files.map(async (file) => {
          const result = await uploadToR2(file.path);
          fs.unlinkSync(file.path);
          return result.url;
        })
      );
      imageUrls = [...imageUrls, ...newImageUrls];
    }

    const updates = {
      ...req.body,
      images: imageUrls,
      updatedAt: new Date(),
    };

    const updatedListing = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    )
      .populate("seller", "username profilePicture")
      .lean();

    res.json({
      success: true,
      data: formatListingResponse(updatedListing),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error updating listing:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update listing",
    });
  }
};

export const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findOne({
      _id: req.params.id,
      seller: req.user._id,
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found or unauthorized",
      });
    }

    // Delete images from storage
    if (listing.images?.length > 0) {
      await Promise.all(
        listing.images.map(async (imageUrl) => {
          try {
            await deleteFromR2(imageUrl);
          } catch (error) {
            console.error("Error deleting image:", error);
          }
        })
      );
    }

    await listing.remove();

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error deleting listing:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete listing",
    });
  }
};

export const getUserListings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const userId = req.params.userId || req.user._id;

    const [listings, total] = await Promise.all([
      Listing.find({ seller: userId })
        .populate("seller", "username profilePicture")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Listing.countDocuments({ seller: userId }),
    ]);

    res.json({
      success: true,
      data: {
        items: listings.map(formatListingResponse),
        total,
        page,
        limit,
        hasMore: total > page * limit,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching user listings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user listings",
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 12,
        hasMore: false,
      },
    });
  }
};

export const saveListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Add to saved array if not already saved
    if (!listing.savedBy) listing.savedBy = [];
    if (!listing.savedBy.includes(req.user._id)) {
      listing.savedBy.push(req.user._id);
      await listing.save();

      // Notify listing owner
      await createNotification(
        req.app.get("io"),
        listing.userId,
        "save",
        listing._id,
        `Someone saved your listing: ${listing.title}`,
      );
    }

    res.json({ message: "Listing saved successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const unsaveListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Remove from saved array
    if (listing.savedBy) {
      listing.savedBy = listing.savedBy.filter(
        (userId) => userId.toString() !== req.user._id.toString(),
      );
      await listing.save();
    }

    res.json({ message: "Listing removed from saved" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSavedListings = async (req, res) => {
  try {
    const listings = await Listing.find({
      savedBy: req.user._id, // Ensure user ID is used, not "saved" as a string
    });
    res.json(listings);
  } catch (error) {
    console.error("Error fetching saved listings:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getPopularListings = async (req, res) => {
  try {
    const listings = await Listing.find()
      .sort({ views: -1, "savedBy.length": -1 })
      .limit(10);
    res.json(listings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTrendingListings = async (req, res) => {
  try {
    const trendingListings = await Listing.find()
      .sort({ views: -1 }) // Sort by views or any other metric
      .limit(10); // Limit to top 10
    res.json(trendingListings);
  } catch (error) {
    res.status(500).json({ message: "Error fetching trending listings" });
  }
};
