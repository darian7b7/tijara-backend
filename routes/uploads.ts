import express from "express";
import { upload, uploadToR2, s3 } from "../middleware/upload.middleware.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();
const BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET;
const CLOUDFLARE_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL;

// Upload Image to Cloudflare R2
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { category } = req.body; // Pass category from frontend ("avatar" or "listing")
    if (!category || (category !== "avatar" && category !== "listing")) {
      return res
        .status(400)
        .json({ error: "Invalid category. Use 'avatar' or 'listing'." });
    }

    const imageUrl = await uploadToR2(req.file, category);
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({
      error: "Image upload failed",
      details: (error as Error).message,
    });
  }
});

// DELETE Image from Cloudflare R2
router.delete("/delete", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "No image URL provided" });
    }

    // Extract file key from URL
    const fileKey = imageUrl.replace(`${CLOUDFLARE_PUBLIC_URL}/`, "");

    // Delete from R2
    await s3.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }),
    );

    res.json({ success: true, message: "Image deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Server error", details: (error as Error).message });
  }
});

export default router;