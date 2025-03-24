import express from "express";
import { protect } from "../middleware/auth.js";
import {
  sendMessage,
  getConversations,
  getMessages,
} from "../controllers/message.controller.js";

const router = express.Router();

router.use(protect);

router.post("/", sendMessage);
router.get("/conversations", getConversations);
router.get("/conversations/:conversationId", getMessages);

export default router;
