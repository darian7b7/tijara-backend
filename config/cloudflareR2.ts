// Cloudflare R2
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// ✅ Initialize Cloudflare R2 Client
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY || "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY || "",
  },
});

// ✅ Upload File to Cloudflare R2
export const uploadToR2 = async (
  file: Express.Multer.File,
  category: string,
) => {
  const folder = category === "avatar" ? "avatars/" : "listings/";
  const fileKey = `${folder}${crypto.randomUUID()}-${file.originalname.replace(/\s/g, "-")}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: fileKey,
      Body: file.buffer,
      ContentType: "image/webp",
    }),
  );

  return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileKey}`;
};

// ✅ Delete File from Cloudflare R2
export const deleteFromR2 = async (imageUrl: string) => {
  const fileKey = imageUrl.replace(
    `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/`,
    "",
  );

  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: fileKey,
    }),
  );

  return { success: true, message: "Image deleted successfully" };
};

export default s3;
