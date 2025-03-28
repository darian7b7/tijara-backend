import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import prisma from "../lib/prismaClient.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        role: string;
      };
    }
  }
}

// Rate limiters
export const loginLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 3, // Limit each IP to 3 requests per windowMs
  message: { message: "Too many login attempts, please try again after 2 minutes." },
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

// Verify JWT token
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("JWT_SECRET is not configured!");
      return res.status(500).json({
        success: false,
        error: {
          code: "SERVER_CONFIG_ERROR",
          message: "Server configuration error"
        }
      });
    }

    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "NO_TOKEN",
          message: "Authentication required. Please log in."
        }
      });
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret) as {
      id: string;
      exp?: number;
    };

    // Check token expiration
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({
        success: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "Your session has expired. Please log in again."
        }
      });
    }

    // Get user from token
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid authentication token."
        }
      });
    }

    // Add user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication Error:", error);
    
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "Your session has expired. Please log in again."
        }
      });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid authentication token."
        }
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: "AUTH_ERROR",
        message: "Authentication failed. Please log in again."
      }
    });
  }
};

// Admin middleware
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Forbidden: Admins only"
      }
    });
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
