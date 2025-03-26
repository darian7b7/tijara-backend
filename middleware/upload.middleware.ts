import multer from "multer";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import dotenv from "dotenv";
import { Request, Response, NextFunction } from "express";
import { getDirname } from "../utils/path.utils.js";
import { join } from "path";

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      processedFiles?: ProcessedFile[];
    }
  }
}

interface ProcessedFile extends Express.Multer.File {
  processedSize?: number;
  buffer: Buffer;
  originalname: string;
}

interface FileWithBuffer {
  originalname: string;
  buffer: Buffer;
  processedSize?: number;
}

interface R2ClientConfig {
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

dotenv.config();

const __dirname = getDirname(import.meta.url);
const uploadsDir = join(__dirname, "..", "uploads");

// Initialize Cloudflare R2 Client
const r2Config: R2ClientConfig = {
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY || "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY || "",
  },
};

export const s3 = new S3Client(r2Config);

// Multer configuration
const storage = multer.memoryStorage();

// File type validation
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const maxFileSize = 10 * 1024 * 1024; // 10MB

// File filter function
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    cb(new Error("Invalid file type. Only JPG, PNG, and WebP are allowed."));
    return;
  }

  // Additional security checks
  if (file.size > maxFileSize) {
    cb(new Error("File size too large. Maximum size is 10MB."));
    return;
  }

  cb(null, true);
};

// Configure multer
export const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSize,
    files: 5, // Maximum 5 files per request
  },
  fileFilter,
});

// Image processing with Sharp
export const processImage = async (buffer: Buffer): Promise<Buffer> => {
  try {
    const processed = await sharp(buffer)
      .resize(1200, 1200, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    return processed;
  } catch (error) {
    throw new Error("Error processing image");
  }
};

// Generate secure filename
export const generateSecureFilename = (originalname: string): string => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString("hex");
  const extension = originalname.split(".").pop()?.toLowerCase() || "webp";
  return `${timestamp}-${random}.${extension}`;
};

// Process multiple images middleware
export const processImagesMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.files || !Array.isArray(req.files)) {
    return next();
  }

  try {
    const processedFiles = await Promise.all(
      req.files.map(async (file: Express.Multer.File) => {
        try {
          const processed = await processImage(file.buffer);
          return {
            ...file,
            buffer: processed,
            processedSize: processed.length,
          } as ProcessedFile;
        } catch (error) {
          console.error(`Error processing file ${file.originalname}:`, error);
          throw error;
        }
      }),
    );

    req.processedFiles = processedFiles;
    next();
  } catch (error) {
    next(error);
  }
};

// Upload to R2
export const uploadToR2 = async (
  file: FileWithBuffer,
  category: "avatar" | "listing" = "listing",
): Promise<{ secure_url: string }> => {
  if (!file.buffer) {
    throw new Error("No file buffer provided");
  }

  try {
    const folder = category === "avatar" ? "avatars/" : "listings/";
    const fileKey = `${folder}${generateSecureFilename(file.originalname)}`;
    const optimizedBuffer = file.processedSize
      ? file.buffer
      : await processImage(file.buffer);

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET || "",
        Key: fileKey,
        Body: optimizedBuffer,
        ContentType: "image/webp",
      }),
    );

    return {
      secure_url: `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileKey}`,
    };
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload file");
  }
};
