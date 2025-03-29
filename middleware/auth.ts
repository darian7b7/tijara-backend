import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

// Add JWT payload type
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// Rate limiters
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per window
  message: "Too many login attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: "Upload limit reached, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth middleware
export const protect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "NO_TOKEN",
          message: "No authorization token provided"
        }
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired token"
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      error: {
        code: "AUTH_ERROR",
        message: "Authentication failed"
      }
    });
  }
};

// Role middleware
export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: {
          code: "NOT_ADMIN",
          message: "Admin access required"
        }
      });
    }
    next();
  } catch (error) {
    console.error("Admin check error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Server error checking admin status"
      }
    });
  }
};

// Listing ownership middleware
export const isListingOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listingId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required"
        }
      });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true }
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "LISTING_NOT_FOUND",
          message: "Listing not found"
        }
      });
    }

    if (listing.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: "NOT_OWNER",
          message: "You do not own this listing"
        }
      });
    }

    next();
  } catch (error) {
    console.error("Listing ownership check error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Server error checking listing ownership"
      }
    });
  }
};
