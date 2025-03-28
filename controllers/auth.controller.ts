import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../lib/prismaClient.js";
import { validationResult } from "express-validator";
import rateLimit from "express-rate-limit";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Rate limiting for login attempts
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per window
  message: "Too many login attempts, please try again after 15 minutes",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const signToken = (userId: string): string => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined");
  }
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Register a New User
export const register = async (req: Request, res: Response) => {
  try {
    console.log("Registration request received:", {
      email: req.body.email,
      username: req.body.username,
    });

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: errors.array()
        }
      });
    }

    const { username, email, password, name } = req.body;

    // Check for existing user
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      const field = existingUser.email === email ? "email" : "username";
      console.log(`Registration failed: ${field} already exists`);
      return res.status(400).json({
        success: false,
        error: {
          code: "DUPLICATE_ENTRY",
          message: `This ${field} is already registered.`
        }
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name,
        role: "USER",
      },
    });

    // Generate tokens
    const accessToken = signToken(user.id);
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || "",
      { expiresIn: "30d" }
    );

    console.log("User registered successfully:", {
      id: user.id,
      email: user.email,
    });

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "An error occurred during registration"
      }
    });
  }
};

// Login User
export const login = async (req: Request, res: Response) => {
  try {
    console.log("Login attempt for:", req.body.email);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password are required"
        }
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        username: true,
        name: true,
        profilePicture: true,
        role: true,
      },
    });

    if (!user) {
      console.log("Login failed: User not found -", email);
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password"
        }
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log("Password verification:", {
      isValid: isValidPassword,
      userEmail: email
    });

    if (!isValidPassword) {
      console.log("Login failed: Invalid password -", email);
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password"
        }
      });
    }

    // Generate tokens
    const accessToken = signToken(user.id);
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || "",
      { expiresIn: "30d" }
    );

    console.log("Login successful:", {
      userId: user.id,
      email: user.email,
      tokensGenerated: true
    });

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "An error occurred during login"
      }
    });
  }
};

// Refresh Token
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_TOKEN",
          message: "Refresh token is required"
        }
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || "") as { id: string };
    
    // Generate new tokens
    const accessToken = signToken(decoded.id);
    const newRefreshToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_SECRET || "",
      { expiresIn: "30d" }
    );

    return res.json({
      success: true,
      data: {
        tokens: {
          accessToken,
          refreshToken: newRefreshToken,
        },
      },
    });
  } catch (error) {
    console.error("Token Refresh Error:", error);
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or expired refresh token"
      }
    });
  }
};

// Logout User
export const logout = (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: "NOT_AUTHENTICATED",
        message: "Not authenticated"
      }
    });
  }

  return res.json({
    success: true,
    message: "Logged out successfully",
  });
};

// Get Authenticated User Info
export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Not authenticated"
        }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        profilePicture: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found"
        }
      });
    }

    return res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get User Error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "An error occurred while fetching user data"
      }
    });
  }
};
