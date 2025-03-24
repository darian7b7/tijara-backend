import pkg from "cloudinary";
const { v2: cloudinary } = pkg;
import { unlink } from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: "dvvchnc37",
  api_key: "839535797426984",
  api_secret: "Qi5dRBErjwKo1SezOAFSw-qpT7Q",
});

export const uploadToCloudinary = async (filePath) => {
  try {
    console.log("Uploading to Cloudinary:", filePath); // Debug log
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "marketplace",
      use_filename: true,
    });

    console.log("Cloudinary upload result:", result); // Debug log

    // Delete the local file after successful upload
    try {
      await unlink(filePath);
    } catch (unlinkError) {
      console.error("Error deleting local file:", unlinkError);
      // Continue even if file deletion fails
    }

    return result;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
};

export default cloudinary;
