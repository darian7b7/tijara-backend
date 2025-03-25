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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username, email, password } = req.body;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "Username or email already exists",
        status: 400
      });
    }

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

    const accessToken = signToken(user.id);
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || '',
      { expiresIn: "30d" }
    );

    res.status(201).json({
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
      status: 201
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
      status: 500
    });
  }
};

// Login User
export const login = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        status: 400
      });
    }

    const { email, password } = req.body;

    const user = await prisma.user.findFirst({
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
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
        status: 401
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
        status: 401
      });
    }

    const accessToken = signToken(user.id);
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || '',
      { expiresIn: "30d" }
    );

    res.json({
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
      status: 200
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
      status: 500
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
    res.status(500).json({
      success: false,
      error: "Error fetching user details",
      status: 500
    });
  }
};
