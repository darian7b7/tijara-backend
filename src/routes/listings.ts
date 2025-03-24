import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { validateListing } from '../validators/listing';

const router = Router();
const prisma = new PrismaClient();

// Get category-specific field definitions
router.get('/fields/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const [attributes, features] = await Promise.all([
      prisma.attributeDefinition.findMany({
        where: { categoryId },
        orderBy: { order: 'asc' },
      }),
      prisma.featureDefinition.findMany({
        where: { categoryId },
      }),
    ]);

    res.json({ attributes, features });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch field definitions' });
  }
});

// Create or update listing (supports draft)
router.post('/', authenticate, async (req, res) => {
  try {
    const { 
      id,
      title, 
      description, 
      price, 
      location, 
      categoryId, 
      status = 'DRAFT',
      attributes = [],
      features = [],
      images = [],
    } = req.body;

    const userId = req.user.id;

    // Validate required fields only if not a draft
    if (status !== 'DRAFT') {
      const validationErrors = await validateListing(req.body);
      if (validationErrors.length > 0) {
        return res.status(400).json({ errors: validationErrors });
      }
    }

    // Create or update the listing
    const listing = await prisma.listing.upsert({
      where: { id: id || '' },
      create: {
        title,
        description,
        price,
        location,
        status,
        userId,
        categoryId,
      },
      update: {
        title,
        description,
        price,
        location,
        status,
        categoryId,
      },
    });

    // Handle attributes
    if (attributes.length > 0) {
      // Delete existing attributes
      if (id) {
        await prisma.attribute.deleteMany({
          where: { listingId: listing.id },
        });
      }

      // Create new attributes
      await prisma.attribute.createMany({
        data: attributes.map(attr => ({
          listingId: listing.id,
          attributeDefinitionId: attr.definitionId,
          value: attr.value,
        })),
      });
    }

    // Handle features
    if (features.length > 0) {
      // Delete existing features
      if (id) {
        await prisma.feature.deleteMany({
          where: { listingId: listing.id },
        });
      }

      // Create new features
      await prisma.feature.createMany({
        data: features.map(feat => ({
          listingId: listing.id,
          featureDefinitionId: feat.definitionId,
          value: feat.value,
        })),
      });
    }

    // Handle images
    if (images.length > 0) {
      // Delete existing images
      if (id) {
        await prisma.image.deleteMany({
          where: { listingId: listing.id },
        });
      }

      // Create new images
      await prisma.image.createMany({
        data: images.map((img, index) => ({
          listingId: listing.id,
          url: img.url,
          order: index,
        })),
      });
    }

    // Return the complete listing with all relations
    const completeListing = await prisma.listing.findUnique({
      where: { id: listing.id },
      include: {
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
        images: {
          orderBy: { order: 'asc' },
        },
        category: true,
      },
    });

    res.json(completeListing);
  } catch (error) {
    console.error('Error creating/updating listing:', error);
    res.status(500).json({ error: 'Failed to create/update listing' });
  }
});

// Get listing with all fields
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
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
        images: {
          orderBy: { order: 'asc' },
        },
        category: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

export default router;
