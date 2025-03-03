import Listing from '../models/listing.model.js';  // Note the .js extension
import { uploadToR2, deleteFromR2 } from "../config/cloudflareR2.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createNotification } from './notification.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const createListing = async (req, res) => {
  try {
    console.log('Received files:', req.files);
    console.log('Received body:', req.body);

    // Parse details if it's a string
    let details = req.body.details;
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch (e) {
        console.error('Error parsing details:', e);
        return res.status(400).json({ message: 'Invalid details format' });
      }
    }

    // Only validate images if user is at step 5 or final submission
if (parseInt(req.body.step) >= 5 && (!req.body.images || req.body.images.length === 0)) {
  return res.status(400).json({ message: "At least one image is required" });
}

  
    // Validate required fields based on step
    const step = parseInt(req.body.step) || 6; // Default to final step if not provided
    
    if (step >= 1 && !req.body.mainCategory) {
      return res.status(400).json({ message: 'Main category is required' });
    }

    if (step >= 2) {
      if (!req.body.title?.trim()) return res.status(400).json({ message: 'Title is required' });
      if (!req.body.category) return res.status(400).json({ message: 'Category is required' });
    }

    if (step >= 3) {
      if (!req.body.price) return res.status(400).json({ message: 'Price is required' });
      if (!req.body.location?.trim()) return res.status(400).json({ message: 'Location is required' });
    }

    // Validate category-specific fields on step 4
    if (step >= 4) {
      const requiredFields = {
        vehicles: ['make', 'model', 'year', 'fuelType', 'transmission'],
        'real-estate': ['propertyType', 'size', 'bedrooms', 'bathrooms']
      };

      const categoryFields = requiredFields[req.body.mainCategory] || [];
      const missingFields = categoryFields.filter(field => !details[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          message: 'Missing required fields',
          fields: missingFields
        });
      }
    }

    // If we're on the final step or no step is specified, create the listing
    if (step >= 5) {
      const imageUrls = await Promise.all(
        req.files.map(async (file) => {
          const result = await uploadToCloudinary(file.path);
          return result.secure_url;
        })
      );

      const listing = new Listing({
        ...req.body,
        details,
        images: imageUrls,
        seller: req.user._id
      });

      await listing.save();
      res.status(201).json(listing);
    } else {
      // If we're not on the final step, just validate and return success
      res.status(200).json({ message: 'Step validation successful' });
    }
  } catch (error) {
    console.error('Error creating listing:', error);
    res.status(500).json({
      message: 'Error creating listing',
      error: error.message
    });
  }
};

// Helper function to validate category-specific details
const validateCategoryDetails = (mainCategory, details) => {
  if (!details || typeof details !== 'object') return false;

  const requiredFields = {
    vehicles: ['transactionType', 'make', 'model', 'year', 'fuelType', 'transmission', 'engineCapacity', 'drivetrain'],
    'real-estate': ['transactionType', 'propertyType', 'size', 'bedrooms', 'bathrooms', 'yearBuilt']
  };

  const required = requiredFields[mainCategory] || [];

  // Find missing fields
  const missingFields = required.filter(field => !details[field] || details[field].trim() === '');

  return missingFields.length === 0 ? null : missingFields; // Return missing fields array or null if all fields are filled
};


export const getListings = async (req, res) => {
  try {
    const { category, search, sort, page = 1, limit = 12 } = req.query;
    const query = {};

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    if (sort === 'price_asc') sortOptions.price = 1;
    if (sort === 'price_desc') sortOptions.price = -1;
    if (sort === 'latest') sortOptions.createdAt = -1;

    const listings = await Listing.find(query)
      .populate('seller', 'username profilePicture')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Listing.countDocuments(query);

    res.json({
      listings,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching listings' });
  }
};

export const getListingById = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Increment views
    listing.views = (listing.views || 0) + 1;
    await listing.save();

    // Create notification for listing owner about the view
    if (req.user && req.user._id.toString() !== listing.userId.toString()) {
      await createNotification(
        req.app.get('io'),
        listing.userId,
        'view',
        listing._id,
        `Someone viewed your listing: ${listing.title}`
      );
    }

    res.json(listing);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user._id;

    // Fetch listing from database
    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Ensure only the listing owner can edit
    if (listing.seller.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to edit this listing" });
    }

    const createdAt = new Date(listing.createdAt);
    const now = new Date();
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

    // Restrict edits based on time rules
    if (updates.category || updates.subcategory) {
      return res.status(400).json({ message: "Category cannot be changed after listing creation" });
    }

    if (updates.transactionType) {
      return res.status(400).json({ message: "Transaction type cannot be changed after listing creation" });
    }

    if (updates.details?.make || updates.details?.model) {
      if (hoursSinceCreation > 1) {
        return res.status(400).json({ message: "Make & model can only be edited within 1 hour of creation" });
      }
    }

    if (updates.details?.year || updates.details?.mileage) {
      if (hoursSinceCreation > 24) {
        return res.status(400).json({ message: "Year & mileage can only be edited within 24 hours of creation" });
      }
    }

    if (updates.location) {
      if (hoursSinceCreation > 24) {
        return res.status(400).json({ message: "Location can only be edited within 24 hours of creation" });
      }
    }

    // Update listing with allowed changes
    Object.keys(updates).forEach((key) => {
      if (key !== "category" && key !== "subcategory" && key !== "transactionType") {
        listing[key] = updates[key];
      }
    });

    await listing.save();

    res.status(200).json({ message: "Listing updated successfully", listing });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error, please try again later" });
  }
};

export const deleteImage = async (req, res) => {
  try {
    const { listingId, imagePath } = req.body;

    // Find the listing
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Ensure the user is authorized
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Remove the image from the database
    listing.images = listing.images.filter(img => img !== imagePath);
    await listing.save();

    // Delete the image from the local uploads folder
    const filePath = path.join(__dirname, "../../uploads", path.basename(imagePath));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted file: ${filePath}`);
    }

    res.status(200).json({ message: "Image deleted successfully", images: listing.images });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ message: "Server error while deleting image" });
  }
};


export const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Check if user is authorized to delete
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this listing" });
    }

    // Delete all images from the folder
    listing.images.forEach((imagePath) => {
      const filePath = path.join(__dirname, "../../uploads", imagePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✅ Deleted file: ${filePath}`);
      }
    });

    await listing.deleteOne();
    return res.status(200).json({ message: "Listing deleted successfully" });
  } catch (error) {
    console.error("Error deleting listing:", error);
    return res.status(500).json({ message: "Error deleting listing" });
  }
};

export const getUserListings = async (req, res) => {
  try {
    const listings = await Listing.find({ seller: req.user._id }).populate("seller", "username email");
    res.json(listings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const saveListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Add to saved array if not already saved
    if (!listing.savedBy) listing.savedBy = [];
    if (!listing.savedBy.includes(req.user._id)) {
      listing.savedBy.push(req.user._id);
      await listing.save();

      // Notify listing owner
      await createNotification(
        req.app.get('io'),
        listing.userId,
        'save',
        listing._id,
        `Someone saved your listing: ${listing.title}`
      );
    }

    res.json({ message: 'Listing saved successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
    
  }
};

export const unsaveListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Remove from saved array
    if (listing.savedBy) {
      listing.savedBy = listing.savedBy.filter(
        userId => userId.toString() !== req.user._id.toString()
      );
      await listing.save();
    }

    res.json({ message: 'Listing removed from saved' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSavedListings = async (req, res) => {
  try {
      const listings = await Listing.find({
          savedBy: req.user._id // Ensure user ID is used, not "saved" as a string
      });
      res.json(listings);
  } catch (error) {
      console.error('Error fetching saved listings:', error);
      res.status(500).json({ message: error.message });
  }
};


export const getPopularListings = async (req, res) => {
  try {
    const listings = await Listing.find()
      .sort({ views: -1, 'savedBy.length': -1 })
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
        res.status(500).json({ message: 'Error fetching trending listings' });
    }
};