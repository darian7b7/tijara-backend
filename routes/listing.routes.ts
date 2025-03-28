import express, { Request, Response } from "express";
import { protect } from "../middleware/auth.js";
import prisma from "../lib/prismaClient.js";
import {
  upload,
  uploadToR2,
  processImage,
  processImagesMiddleware,
} from "../middleware/upload.middleware.js";
import { Prisma, ListingStatus } from "@prisma/client";
import {
  AuthRequest,
  ProcessedImage,
  ListingCreateInput,
  ListingUpdateInput,
} from "../types/shared.js";

const router = express.Router();

const formatListingResponse = (listing: any) => {
  if (!listing) return null;

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    location: listing.location || "",
    category: listing.category,
    images: listing.images?.map((img: any) => img.url) || [],
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    status: listing.status,
    seller: listing.user
      ? {
          id: listing.user.id,
          username: listing.user.username,
          profilePicture: listing.user.profilePicture,
        }
      : undefined,
    savedBy:
      listing.favorites?.map((fav: any) => ({
        id: fav.id,
        userId: fav.userId,
      })) || [],
    attributes: listing.attributes,
    features: listing.features,
  };
};

// Public Routes
router.get("/", async (req: Request, res: Response) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { status: "ACTIVE" },
      include: {
        images: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: {
        items: listings,
        total: listings.length,
        page: 1,
        limit: 10,
        hasMore: false,
      },
      status: 200,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    res.status(500).json({
      success: false,
      error: errorMessage,
      status: 500,
      data: null,
    });
  }
});

router.get("/search", async (req: Request, res: Response) => {
  try {
    const { query, category, minPrice, maxPrice } = req.query;

    const where: Prisma.ListingWhereInput = {
      status: "ACTIVE",
      ...(query &&
        typeof query === "string" && {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        }),
      ...(category && typeof category === "string" && { category }),
      ...(minPrice || maxPrice
        ? {
            price: {
              ...(minPrice &&
                typeof minPrice === "string" && { gte: parseFloat(minPrice) }),
              ...(maxPrice &&
                typeof maxPrice === "string" && { lte: parseFloat(maxPrice) }),
            },
          }
        : {}),
    };

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          images: true,
          favorites: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.listing.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: listings.map((listing) => formatListingResponse(listing)),
        total,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 10,
        hasMore: total > (parseInt(req.query.limit as string) || 10),
      },
      status: 200,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Error searching listings",
      status: 500,
      data: null,
    });
  }
});

router.get("/trending", async (_req: Request, res: Response) => {
  try {
    const trendingListings = await prisma.listing.findMany({
      where: { status: "ACTIVE" },
      include: {
        images: true,
        _count: {
          select: { favorites: true },
        },
      },
      orderBy: {
        favorites: {
          _count: "desc",
        },
      },
      take: 10,
    });

    res.json({
      success: true,
      data: { items: trendingListings },
      status: 200,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      success: false,
      error: errorMessage,
      status: 500,
      data: null,
    });
  }
});

// Protected Routes
router.use(protect);

router.get("/saved", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        status: 401,
        data: null,
      });
    }

    const savedListings = await prisma.favorite.findMany({
      where: { userId },
      include: {
        listing: {
          include: {
            images: true,
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
            favorites: true,
          },
        },
      },
    });

    const formattedListings = savedListings.map((favorite) =>
      formatListingResponse(favorite.listing),
    );

    res.json({
      success: true,
      data: { items: formattedListings },
      status: 200,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
      status: 500,
      data: null,
    });
  }
});

router.post(
  "/",
  upload.array("images"),
  processImagesMiddleware,
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
          status: 401,
          data: null,
        });
      }

      const {
        title,
        description,
        price,
        category,
        location = "",
        attributes = [],
        features = [],
        condition, // Added condition field
      } = req.body;

      const images = authReq.processedImages || [];

      const listing = await prisma.listing.create({
        data: {
          title,
          description,
          price: parseFloat(price),
          category,
          location,
          status: ListingStatus.ACTIVE,
          condition, // Added condition field
          userId,
          images: {
            create: images.map((image, index) => ({
              url: image.url,
              order: index,
            })),
          },
          attributes: {
            create: attributes.map(
              (attr: { definitionId: string; value: string }) => ({
                attributeDefinitionId: attr.definitionId,
                value: attr.value,
              }),
            ),
          },
          features: {
            create: features.map(
              (feat: { definitionId: string; value: string }) => ({
                featureDefinitionId: feat.definitionId,
                value: feat.value,
              }),
            ),
          },
        },
        include: {
          images: true,
          attributes: true,
          features: true,
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          favorites: true,
        },
      });

      res.status(201).json({
        success: true,
        data: formatListingResponse(listing),
        status: 201,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        success: false,
        error: errorMessage,
        status: 500,
        data: null,
      });
    }
  },
);

router.get("/:id", async (req, res) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: {
        images: true,
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        favorites: true,
      },
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Listing not found",
        status: 404,
        data: null,
      });
    }

    res.json({
      success: true,
      data: formatListingResponse(listing),
      status: 200,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      status: 500,
      data: null,
    });
  }
});

router.put(
  "/:id",
  upload.array("images"),
  processImagesMiddleware,
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;

      const {
        title,
        description,
        price,
        category,
        location = "",
        attributes = [],
        features = [],
      } = req.body;

      const newImages = authReq.processedImages || [];
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
          category,
          location,
          images: {
            create: newImages.map((image: ProcessedImage, index: number) => ({
              url: image.url,
              order: existingImages.length + index,
            })),
          },
          attributes: {
            deleteMany: {},
            create: attributes.map(
              (attr: { definitionId: string; value: string }) => ({
                attributeDefinitionId: attr.definitionId,
                value: attr.value,
              }),
            ),
          },
          features: {
            deleteMany: {},
            create: features.map(
              (feat: { definitionId: string; value: string }) => ({
                featureDefinitionId: feat.definitionId,
                value: feat.value,
              }),
            ),
          },
        },
        include: {
          images: true,
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
            },
          },
          favorites: true,
        },
      });

      res.json({
        success: true,
        data: formatListingResponse(listing),
        status: 200,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        status: 500,
        data: null,
      });
    }
  },
);

router.delete("/:id", async (req, res) => {
  try {
    await prisma.listing.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      status: 500,
      data: null,
    });
  }
});

export default router;
