const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { updateListing } = require('../controllers/listingController');
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

router.get('/', async (req, res) => {
  try {
    const {
      mainCategory,
      sort = 'latest',
      limit = 12,
      page = 1
    } = req.query;

    // Build query
    const query = {};
    
    // Ensure mainCategory is properly filtered
    if (mainCategory) {
      query.mainCategory = mainCategory;
    }

    // Build sort options
    let sortOptions;
    switch (sort) {
      case 'trending':
        sortOptions = { views: -1, createdAt: -1 };
        break;
      case 'latest':
        sortOptions = { createdAt: -1 };
        break;
      case 'price_low':
        sortOptions = { price: 1 };
        break;
      case 'price_high':
        sortOptions = { price: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    console.log('Query:', query); // Debug log
    console.log('Sort:', sortOptions); // Debug log

    const listings = await Listing.find(query)
      .sort(sortOptions)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('seller', 'username profilePicture');

    // Double-check mainCategory filter
    const filteredListings = listings.filter(
      listing => !mainCategory || listing.mainCategory === mainCategory
    );

    const total = await Listing.countDocuments(query);

    res.json({
      listings: filteredListings,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total: filteredListings.length
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ message: 'Error fetching listings' });
  }
});

router.post('/', upload.array('images', 5), async (req, res) => {
  console.log('Request body:', req.body);
  console.log('Files:', req.files);
  
  try {
    let details = req.body.details;
    if (typeof details === 'string') {
      details = JSON.parse(details);
    }

    const listing = new Listing({
      ...req.body,
      details,
      images: req.files.map(file => file.path),
      seller: req.user._id
    });

    console.log('Creating listing:', listing);

    await listing.save();
    res.status(201).json(listing);
  } catch (error) {
    console.error('Error creating listing:', error);
    res.status(500).json({
      message: 'Error creating listing',
      error: error.message,
      details: error.errors
    });
  }
});

router.put('/:id', protect, updateListing);

router.delete('/delete-image', auth, deleteImage);
router.delete('/:id', auth, deleteListing);

export interface Message {  }