import { Request, Response } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../lib/prismaClient.js";
import { validationResult } from "express-validator";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const generateTokens = (userId: string): AuthTokens => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const accessTokenOptions: SignOptions = {
    expiresIn: parseInt(process.env.JWT_EXPIRY || "604800", 10), // 7 days in seconds
  };

  const refreshTokenOptions: SignOptions = {
    expiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRY || "2592000", 10), // 30 days in seconds
  };

  const accessToken = jwt.sign({ id: userId }, jwtSecret, accessTokenOptions);
  const refreshToken = jwt.sign({ id: userId }, jwtSecret, refreshTokenOptions);

  return { accessToken, refreshToken };
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
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input data",
          errors: errors.array()
        }
      });
    }

    const { username, email, password, name } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          code: "USER_EXISTS",
          message: existingUser.email === email 
            ? "Email already registered" 
            : "Username already taken"
        }
      });
    }

    // Hash password with configured salt rounds
    const salt = await bcrypt.genSalt(Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
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
    const tokens = generateTokens(user.id);

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
        tokens,
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
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
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
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password"
        }
      });
    }

    // Generate tokens
    const tokens = generateTokens(user.id);

    console.log("Login successful:", {
      userId: user.id,
      email: user.email
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
        tokens,
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
          code: "VALIDATION_ERROR",
          message: "Refresh token is required"
        }
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not configured");
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, jwtSecret) as { id: string };

    // Generate new tokens
    const tokens = generateTokens(decoded.id);

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        profilePicture: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid refresh token"
        }
      });
    }

    return res.json({
      success: true,
      data: {
        user,
        tokens,
      },
    });
  } catch (error) {
    console.error("Token Refresh Error:", error);

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "Refresh token has expired"
        }
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid refresh token"
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "An error occurred while refreshing token"
      }
    });
  }
};

// Logout User
export const logout = async (req: Request, res: Response) => {
  try {
    // Since we're using JWT, we don't need to do anything server-side
    // The client should remove the tokens
    return res.json({
      success: true,
      data: {
        message: "Successfully logged out"
      }
    });
  } catch (error) {
    console.error("Logout Error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "An error occurred during logout"
      }
    });
  }
};

// Get Authenticated User Info
export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "AUTH_ERROR",
          message: "Not authenticated"
        }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        profilePicture: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
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
