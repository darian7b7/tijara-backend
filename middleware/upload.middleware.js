import multer from "multer";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// ✅ Initialize Cloudflare R2 Client
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY,
  },
});

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only JPG, PNG, and WEBP are allowed."),
        false,
      );
    }
  },
});

const processImage = async (file) => {
  if (!file || !file.buffer) {
    throw new Error('Invalid file input');
  }
  
  try {
    return await sharp(file.buffer)
      .resize(800, 600, { fit: "cover" })
      .toFormat("webp", { quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Failed to process image');
  }
};

const processImagesMiddleware = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    // Process each file
    const processedFiles = await Promise.all(
      req.files.map(async (file) => {
        try {
          const processed = await processImage(file);
          return {
            ...file,
            buffer: processed,
            processedSize: processed.length,
          };
        } catch (error) {
          console.error(`Error processing file ${file.originalname}:`, error);
          return file; // Keep original file if processing fails
        }
      })
    );

    req.files = processedFiles;
    next();
  } catch (error) {
    console.error('Error in image processing middleware:', error);
    next(error);
  }
};

const uploadToR2 = async (file, category) => {
  if (!file || !file.buffer) {
    throw new Error('Invalid file input');
  }

  try {
    const folder = category === "avatar" ? "avatars/" : "listings/";
    const fileKey = `${folder}${crypto.randomUUID()}-${file.originalname.replace(/\s/g, "-")}`;

    const optimizedBuffer = file.processedSize ? file.buffer : await processImage(file);

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        Key: fileKey,
        Body: optimizedBuffer,
        ContentType: "image/webp",
      }),
    );

    return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileKey}`;
  } catch (error) {
    console.error('Error uploading to R2:', error);
    throw new Error('Failed to upload image');
  }
};

export { upload, uploadToR2, s3, processImage, processImagesMiddleware };
