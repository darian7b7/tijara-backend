import { Request, Response } from "express";
import { ListingStatus, ListingAction, Prisma } from "@prisma/client";
import prisma from "../lib/prismaClient.js";
import { uploadToR2, deleteFromR2 } from "../config/cloudflareR2.js";
import fs from "fs";
import { createNotification } from "./notification.controller.js";
import { APIResponse } from "../types/shared.js";

interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  files?: Express.Multer.File[];
  processedImages?: Array<{ url: string; order: number; }>;
}

type ListingWithRelations = Prisma.ListingGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        username: true;
        profilePicture: true;
      };
    };
    images: true;
    favorites: true;
    attributes: true;
    features: true;
  };
}>;

interface UploadResult {
  url: string;
}

const formatListingResponse = (listing: ListingWithRelations | null) => {
  if (!listing) return null;
  
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    location: listing.location,
    category: listing.category,
    images: listing.images.map(img => img.url),
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    status: listing.status,
    seller: listing.user ? {
      id: listing.user.id,
      username: listing.user.username,
      profilePicture: listing.user.profilePicture,
    } : undefined,
    savedBy: listing.favorites.map(fav => ({
      id: fav.id,
      userId: fav.userId,
    })),
    attributes: listing.attributes || [],
    features: listing.features || [],
  };
};

const validateListingData = (data: any): string[] => {
  const errors: string[] = [];

  // Basic validation
  if (!data.title) errors.push("Title is required");
  if (!data.description) errors.push("Description is required");
  if (!data.price) errors.push("Price is required");
  if (!data.location) errors.push("Location is required");
  if (!data.category) errors.push("Category is required");

  // Specific category validation
  const requiredFields = {
    "vehicles": ["vehicleType", "make", "model", "year"],
    "real-estate": ["propertyType", "size", "bedrooms", "bathrooms"],
  };

  const categoryFields = requiredFields[data.category.mainCategory as keyof typeof requiredFields] || [];
  const missingFields = categoryFields.filter(
    (field) => !data.details?.[field],
  );

  if (missingFields.length > 0) {
    errors.push(`Missing required fields for ${data.category.mainCategory}: ${missingFields.join(", ")}`);
  }

  return errors;
};

export const createListing = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, price, category, location, condition, attributes, features } = req.body;
    const errors = validateListingData(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        errors,
        status: 400,
        data: null
      });
    }

    const listing = await prisma.listing.create({
      data: {
        title,
        description,
        price: parseFloat(price),
        category,
        location,
        condition,
        status: ListingStatus.ACTIVE,
        userId: req.user.id,
        images: {
          create: req.processedImages?.map(img => ({
            url: img.url,
            order: img.order,
          })) || [],
        },
        attributes: attributes ? {
          create: attributes
        } : undefined,
        features: features ? {
          create: features
        } : undefined,
      },
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
        attributes: true,
        features: true,
      },
    });

    const response: APIResponse<any> = {
      success: true,
      data: formatListingResponse(listing),
      status: 201
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("Error creating listing:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error creating listing",
      status: 500,
      data: null
    });
  }
};

export const getListings = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 12));
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const minPrice = parseFloat(req.query.minPrice as string) || 0;
    const maxPrice = parseFloat(req.query.maxPrice as string) || Number.MAX_SAFE_INTEGER;
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";

    const where: Prisma.ListingWhereInput = {
      OR: search ? [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ] : undefined,
      category: category || undefined,
      price: {
        gte: minPrice,
        lte: maxPrice,
      },
      status: ListingStatus.ACTIVE,
    };

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
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
          attributes: true,
          features: true,
        },
      }),
      prisma.listing.count({ where }),
    ]);

    const formattedListings = listings.map(listing => formatListingResponse(listing as ListingWithRelations));

    res.json({
      success: true,
      data: {
        listings: formattedListings,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting listings:", error);
    res.status(500).json({
      success: false,
      message: "Error getting listings",
    });
  }
};

export const getListing = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const listing = await prisma.listing.findUnique({
      where: { id },
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
        attributes: true,
        features: true,
      },
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Create view notification if viewer is not the seller
    if (req.user && req.user.id !== listing.userId) {
      await createNotification(
        req.app.get("io"),
        listing.userId,
        "LISTING_INTEREST",
        listing.id,
        `${req.user.username} viewed your listing "${listing.title}"`
      );
    }

    res.json({
      success: true,
      data: formatListingResponse(listing as ListingWithRelations),
    });
  } catch (error) {
    console.error("Error getting listing:", error);
    res.status(500).json({
      success: false,
      message: "Error getting listing",
    });
  }
};

export const updateListing = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, price, category, location, condition, attributes, features } = req.body;
    
    const listing = await prisma.listing.update({
      where: { id },
      data: {
        title,
        description,
        price: parseFloat(price),
        category,
        location,
        condition,
        attributes: attributes ? {
          deleteMany: {},
          create: attributes
        } : undefined,
        features: features ? {
          deleteMany: {},
          create: features
        } : undefined,
        images: req.processedImages ? {
          deleteMany: {},
          create: req.processedImages.map(img => ({
            url: img.url,
            order: img.order,
          }))
        } : undefined
      },
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
        attributes: true,
        features: true,
      },
    });

    res.json({
      success: true,
      data: formatListingResponse(listing as ListingWithRelations),
      status: 200
    });
  } catch (error) {
    console.error("Error updating listing:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error updating listing",
      status: 500,
      data: null
    });
  }
};

export const deleteListing = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    if (listing.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this listing",
      });
    }

    // Delete images from storage
    for (const image of listing.images) {
      await deleteFromR2(image.url);
    }

    await prisma.listing.delete({ where: { id } });

    res.json({
      success: true,
      message: "Listing deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting listing:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting listing",
    });
  }
};

export const toggleSaveListing = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
        images: {
          select: {
            id: true,
            url: true,
          },
        },
        favorites: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    const existingFavorite = await prisma.favorite.findFirst({
      where: {
        listingId: id,
        userId: req.user.id,
      },
    });

    if (existingFavorite) {
      await prisma.favorite.delete({
        where: { id: existingFavorite.id },
      });
    } else {
      await prisma.favorite.create({
        data: {
          listingId: id,
          userId: req.user.id,
        },
      });

      // Create save notification
      if (req.user.id !== listing.userId) {
        await createNotification(
          req.app.get("io"),
          listing.userId,
          "LISTING_INTEREST",
          listing.id,
          `${req.user.username} saved your listing "${listing.title}"`
        );
      }
    }

    const updatedListing = await prisma.listing.findUnique({
      where: { id },
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
        attributes: true,
        features: true,
      },
    });

    res.json({
      success: true,
      data: formatListingResponse(updatedListing as ListingWithRelations),
    });
  } catch (error) {
    console.error("Error toggling save listing:", error);
    res.status(500).json({
      success: false,
      message: "Error toggling save listing",
    });
  }
};
