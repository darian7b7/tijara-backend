import express, { RequestHandler } from "express";
import { protect } from "../middleware/auth.js";
import {
  sendMessage,
  getMessages,
  deleteMessage,
} from "../controllers/message.controller.js";

const router = express.Router();

router.use(protect);

router.post("/", sendMessage as unknown as RequestHandler);
router.get("/:conversationId", getMessages as unknown as RequestHandler);
router.delete("/:messageId", deleteMessage as unknown as RequestHandler);

export default router;
