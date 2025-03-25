import express, { Request, Response, NextFunction } from "express";
import { protect } from "../middleware/auth.js";
import {
  updateProfile,
  getUserProfile,
  getUserListings,
  getUserSettings,
  updateUserSettings
} from "../controllers/user.controller.js";
import {
  upload,
  processImage,
  uploadToR2,
} from "../middleware/upload.middleware.js";

// Define AuthRequest type for type safety
interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  file?: Express.Multer.File;
}

const router = express.Router();

// Type-safe request handler wrapper
const asyncHandler = (fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  Promise.resolve(fn(req as AuthRequest, res, next)).catch(next);
};

// Middleware to process profile picture
const processProfilePicture = asyncHandler(async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.file) {
    // Upload processed image to R2
    req.body.profilePicture = await uploadToR2(req.file, "avatar");
  }
  next();
});

// ✅ Ensure all routes require authentication
router.use(protect);

// ✅ Get user profile
router.get("/profile", asyncHandler(getUserProfile));

// ✅ Update profile (optional profile picture upload)
router.put(
  "/profile",
  upload.single("profilePicture"),
  processProfilePicture,
  asyncHandler(updateProfile)
);

// ✅ Get user settings
router.get("/settings", asyncHandler(getUserSettings));

// ✅ Update settings
router.post("/settings", asyncHandler(updateUserSettings));

// Get user's listings
router.get("/listings", asyncHandler(getUserListings));

export default router;
