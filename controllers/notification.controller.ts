import { Request, Response } from "express";
import { Prisma, NotificationType } from "@prisma/client";
import prisma from "../lib/prismaClient.js";
import { Server } from "socket.io";
import { AuthRequest } from "../types/index.js";

const validateNotificationType = (type: string): type is NotificationType => {
  return Object.values(NotificationType).includes(type as NotificationType);
};

export const createNotification = async (
  io: Server,
  userId: string,
  type: NotificationType,
  relatedId: string,
  content: string,
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
    const limit = Math.max(
      1,
      Math.min(50, parseInt(req.query.limit as string) || 20),
    );
    const skip = (page - 1) * limit;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    const total = await prisma.notification.count({
      where: {
        userId: req.user.id,
      },
    });

    res.json({
      success: true,
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get notifications",
    });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark notification as read",
    });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        read: false,
      },
      data: {
        read: true,
      },
    });

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark all notifications as read",
    });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const notification = await prisma.notification.delete({
      where: { id, userId: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete notification",
    });
  }
};

export const clearAllNotifications = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const result = await prisma.notification.deleteMany({
      where: { userId: req.user.id },
    });

    res.json({
      success: true,
      message: "All notifications cleared",
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Clear all notifications error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear all notifications",
    });
  }
};
