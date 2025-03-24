import express from "express";
import { protect } from "../middleware/auth.js";
import {
  upload,
  uploadToR2,
  processImage,
  processImagesMiddleware,
} from "../middleware/upload.middleware.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = express.Router();

// Public Routes
router.get("/", async (req, res) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      include: {
        images: true,
        category: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { query, category, minPrice, maxPrice } = req.query;
    
    const where = {
      status: 'ACTIVE',
      ...(query && {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      }),
      ...(category && { categoryId: category }),
      ...(minPrice || maxPrice ? {
        price: {
          ...(minPrice && { gte: parseFloat(minPrice) }),
          ...(maxPrice && { lte: parseFloat(maxPrice) }),
        },
      } : {}),
    };

    const listings = await prisma.listing.findMany({
      where,
      include: {
        images: true,
        category: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/trending", async (req, res) => {
  try {
    const trendingListings = await prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      include: {
        images: true,
        category: true,
        _count: {
          select: { favorites: true },
        },
      },
      orderBy: {
        favorites: {
          _count: 'desc',
        },
      },
      take: 10,
    });
    res.json(trendingListings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Protected Routes
router.use(protect);

router.get("/saved", async (req, res) => {
  try {
    const savedListings = await prisma.favorite.findMany({
      where: { userId: req.user.id },
      include: {
        listing: {
          include: {
            images: true,
            category: true,
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    res.json(savedListings.map(favorite => favorite.listing));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", upload.array("images"), processImagesMiddleware, async (req, res) => {
  try {
    const { title, description, price, categoryId, attributes = [], features = [] } = req.body;
    const images = req.processedImages || [];

    const listing = await prisma.listing.create({
      data: {
        title,
        description,
        price: parseFloat(price),
        categoryId,
        userId: req.user.id,
        images: {
          create: images.map((image, index) => ({
            url: image.url,
            order: index,
          })),
        },
        attributes: {
          create: attributes.map(attr => ({
            attributeDefinitionId: attr.definitionId,
            value: attr.value,
          })),
        },
        features: {
          create: features.map(feat => ({
            featureDefinitionId: feat.definitionId,
            value: feat.value,
          })),
        },
      },
      include: {
        images: true,
        category: true,
        attributes: true,
        features: true,
      },
    });

    res.status(201).json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: {
        images: true,
        category: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        attributes: {
          include: {
            attributeDefinition: true,
          },
        },
        features: {
          include: {
            featureDefinition: true,
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", upload.array("images"), processImagesMiddleware, async (req, res) => {
  try {
    const { title, description, price, categoryId, attributes = [], features = [] } = req.body;
    const newImages = req.processedImages || [];
    const existingImages = req.body.existingImages || [];

    // First, delete removed images
    await prisma.image.deleteMany({
      where: {
        listingId: req.params.id,
        url: { notIn: existingImages },
      },
    });

    // Update the listing
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        price: parseFloat(price),
        categoryId,
        images: {
          create: newImages.map((image, index) => ({
            url: image.url,
            order: existingImages.length + index,
          })),
        },
        attributes: {
          deleteMany: {},
          create: attributes.map(attr => ({
            attributeDefinitionId: attr.definitionId,
            value: attr.value,
          })),
        },
        features: {
          deleteMany: {},
          create: features.map(feat => ({
            featureDefinitionId: feat.definitionId,
            value: feat.value,
          })),
        },
      },
      include: {
        images: true,
        category: true,
        attributes: true,
        features: true,
      },
    });

    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.listing.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
