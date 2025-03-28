import express, { RequestHandler } from "express";
import { protect } from "../middleware/auth.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "../controllers/notification.controller.js";

const router = express.Router();

// All notification routes should be protected
router.use(protect);

router.get("/", getNotifications as unknown as RequestHandler);
router.put("/:id/read", markAsRead as unknown as RequestHandler);
router.put("/read-all", markAllAsRead as unknown as RequestHandler);

export default router;
