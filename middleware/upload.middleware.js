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
      cb(new Error("Invalid file type. Only JPG, PNG, and WEBP are allowed."), false);
    }
  },
});

const processImage = async (file) => {
  return await sharp(file.buffer)
    .resize(800, 600, { fit: "cover" })
    .toFormat("webp", { quality: 80 })
    .toBuffer();
};

const uploadToR2 = async (file, category) => {
  const folder = category === "avatar" ? "avatars/" : "listings/";
  const fileKey = `${folder}${crypto.randomUUID()}-${file.originalname.replace(/\s/g, "-")}`;

  const optimizedBuffer = await processImage(file);

  await s3.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    Key: fileKey,
    Body: optimizedBuffer,
    ContentType: "image/webp",
  }));

  return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileKey}`;
};

export { upload, uploadToR2, s3, processImage };