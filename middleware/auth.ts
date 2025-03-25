import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import prisma from "../lib/prismaClient.js";

// Custom type for Request with user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
    }
  }
}

// Rate limiters
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { message: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: { message: "Upload limit reached, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const listingLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // Limit each IP to 10 listings per day
  message: {
    message: "Listing creation limit reached, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

interface JwtPayload {
  id: string;
  iat?: number;
  exp?: number;
}

// Verify JWT token
export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as JwtPayload;

    // Get user from token
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized, invalid token" });
  }
};

// Admin middleware
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Forbidden: Admins only" });
  }
  next();
};

// Check listing ownership
export const isListingOwner = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    });

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    if (listing.userId !== req.user?.id) {
      return res
        .status(403)
        .json({ message: "Not authorized to modify this listing" });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
