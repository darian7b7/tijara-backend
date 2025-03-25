import { Request, Response } from "express";
import { Prisma, NotificationType } from "@prisma/client";
import prisma from "../lib/prismaClient.js";

interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

const validateNotificationType = (type: string): type is NotificationType => {
  return Object.values(NotificationType).includes(type as NotificationType);
};

export const createNotification = async (
  io: any,
  userId: string,
  type: NotificationType,
  relatedId: string,
  content: string
) => {
  try {
    if (!validateNotificationType(type)) {
      throw new Error("Invalid notification type");
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        content,
        relatedId,
        read: false,
      },
    });

    io.to(userId).emit("notification", notification);

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 12));
    const type = req.query.type as NotificationType;

    const where: Prisma.NotificationWhereInput = {
      userId: req.user.id,
      ...(type && validateNotificationType(type) ? { type } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        total,
        page,
        limit,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error getting notifications",
      timestamp: new Date().toISOString(),
    });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    const notification = await prisma.notification.update({
      where: { id: notificationId, userId: req.user.id },
      data: { read: true },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: notification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Error marking notification as read",
      timestamp: new Date().toISOString(),
    });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });

    res.json({
      success: true,
      data: { modifiedCount: result.count },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Error marking all notifications as read",
      timestamp: new Date().toISOString(),
    });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    const notification = await prisma.notification.delete({
      where: { id: notificationId, userId: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: notification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting notification",
      timestamp: new Date().toISOString(),
    });
  }
};

export const clearAllNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.notification.deleteMany({
      where: { userId: req.user.id },
    });

    res.json({
      success: true,
      data: { deletedCount: result.count },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error clearing all notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error clearing all notifications",
      timestamp: new Date().toISOString(),
    });
  }
};
