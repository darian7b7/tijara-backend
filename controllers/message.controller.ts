import { Response } from "express";
import prisma from "../lib/prismaClient.js";
import { AuthRequest } from "../types/index.js";

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId, content, listingId } = req.body;
    const senderId = req.user.id;

    let conversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          {
            participants: {
              some: {
                id: senderId,
              },
            },
          },
          {
            participants: {
              some: {
                id: receiverId,
              },
            },
          },
          { listingId },
        ],
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          participants: {
            connect: [{ id: senderId }, { id: receiverId }],
          },
          listingId,
          lastMessage: null,
          lastMessageAt: new Date(),
        },
      });
    }

    const message = await prisma.message.create({
      data: {
        content,
        senderId,
        recipientId: receiverId,
        conversationId: conversation.id,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
      },
    });

    // Update conversation's last message
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessage: content,
        lastMessageAt: new Date(),
      },
    });

    res.json({
      success: true,
      message,
      conversation,
    });
  } catch (error) {
    console.error("Message error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send message",
    });
  }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            id: req.user.id,
          },
        },
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get conversations",
    });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { page = "1", limit = "20" } = req.query as {
      page?: string;
      limit?: string;
    };
    const skip = (Number(page) - 1) * Number(limit);

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [{ senderId: req.user.id }, { recipientId: req.user.id }],
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profilePicture: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: Number(limit),
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        conversationId,
        recipientId: req.user.id,
        read: false,
      },
      data: {
        read: true,
      },
    });

    res.json({
      success: true,
      messages: messages.reverse(),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get messages",
    });
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "Message not found",
      });
    }

    if (message.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this message",
      });
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete message",
    });
  }
};
