import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../lib/prismaClient.js";
import { validationResult } from "express-validator";

interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const signToken = (userId: string): string => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
  }
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Register a New User
export const register = async (req: Request, res: Response) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation Errors:", errors.array());
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array()
      });
    }

    const { username, email, password } = req.body;
    console.log("Processing registration for:", { username, email });

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
        message: `This ${field} is already registered.`
      });
    }

    // Create new user
    try {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);
      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          role: 'USER', // Add default role
        },
      });

      // Generate token
      const accessToken = signToken(user.id);
      const refreshToken = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET || '',
        { expiresIn: "30d" }
      );
      console.log("Registration successful for:", email);

      return res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            profilePicture: user.profilePicture,
          },
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (err) {
      console.error("Database Error during registration:", err);
      if (err instanceof prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          return res.status(400).json({
            success: false,
            message: "This email or username is already registered."
          });
        }
      }
      throw err;
    }
  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during registration."
    });
  }
};

// Login User
export const login = async (req: Request, res: Response) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Login Validation Errors:", errors.array());
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    console.log("Processing login for:", email);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        username: true,
        profilePicture: true,
        role: true,
      },
    });

    if (!user) {
      console.log("Login failed: User not found -", email);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log("Login failed: Invalid password -", email);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Generate token
    const accessToken = signToken(user.id);
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || '',
      { expiresIn: "30d" }
    );
    console.log("Login successful for:", email);

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
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
      message: "An error occurred during login."
    });
  }
};

// Logout User
export const logout = (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: null,
    message: "Logged out successfully",
    status: 200
  });
};

// Get Authenticated User Info
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        profilePicture: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        status: 404
      });
    }

    res.json({
      success: true,
      data: { user },
      status: 200
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    return res.status(500).json({
      success: false,
      error: "Error fetching user details",
      status: 500
    });
  }
};
