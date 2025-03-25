import prisma from "../lib/prismaClient";

const validateNotificationType = (type) => {
  const validTypes = ["message", "like", "view", "save"];
  return validTypes.includes(type);
};

export const createNotification = async (
  io,
  userId,
  type,
  listingId,
  message,
  title = ""
) => {
  try {
    if (!validateNotificationType(type)) {
      throw new Error("Invalid notification type");
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        listingId,
        message,
        title,
        createdAt: new Date(),
        read: false,
      },
    });

    // Emit the notification to the specific user
    io.to(userId.toString()).emit("notification", {
      success: true,
      data: notification,
      timestamp: new Date().toISOString(),
    });

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

export const getNotifications = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 20,
          hasMore: false,
        },
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const type = req.query.type;

    const query = { userId: req.user._id };
    if (type && validateNotificationType(type)) {
      query.type = type;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        items: notifications || [],
        page,
        limit,
        total,
        hasMore: total > page * limit,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      },
    });
  }
};

export const markAsRead = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        data: null,
      });
    }

    const { notificationId } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: req.user._id },
      { read: true, updatedAt: new Date() },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
        data: null,
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
      error: "Failed to mark notification as read",
      data: null,
    });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        data: null,
      });
    }

    const result = await Notification.updateMany(
      { userId: req.user._id, read: false },
      { read: true, updatedAt: new Date() }
    );

    res.json({
      success: true,
      data: { modifiedCount: result.modifiedCount },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark all notifications as read",
      data: null,
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        data: null,
      });
    }

    const { notificationId } = req.params;
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
        data: null,
      });
    }

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete notification",
      data: null,
    });
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        data: null,
      });
    }

    const result = await Notification.deleteMany({ userId: req.user._id });

    res.json({
      success: true,
      data: { deletedCount: result.deletedCount },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error clearing all notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear all notifications",
      data: null,
    });
  }
};
