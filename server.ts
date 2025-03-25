import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { Socket } from "socket.io";
import prisma from "./lib/prismaClient.js";
import dotenv from "dotenv";
import morgan from "morgan";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
    }
  }
}

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Import routes
import authRoutes from "./routes/auth.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import userRoutes from "./routes/user.routes.js";
import messageRoutes from "./routes/message.routes.js";
import uploadRoutes from "./routes/uploads.js";
import notificationRoutes from "./routes/notification.routes.js";

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messaging", messageRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/notifications", notificationRoutes);

// Serve images locally if not using Cloudflare
app.use("/uploads", express.static("uploads"));

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Socket.io setup
const io = new Server(httpServer, {
  serveClient: false,
  pingTimeout: 30000,
  pingInterval: 25000,
  cookie: false,
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make io available in routes
app.set("io", io);

// Socket.io connection handling
io.on("connection", (socket: Socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userId: string) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  socket.on(
    "sendMessage",
    async (data: {
      senderId: string;
      recipientId: string;
      conversationId: string;
      content: string;
    }) => {
      try {
        const message = await prisma.message.create({
          data: {
            content: data.content,
            sender: {
              connect: { id: data.senderId }
            },
            recipient: {
              connect: { id: data.recipientId }
            },
            conversation: {
              connect: { id: data.conversationId }
            }
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                profilePicture: true
              }
            }
          }
        });

        // Send to recipient
        io.to(data.recipientId).emit("newMessage", message);
        // Send back to sender
        socket.emit("messageSent", message);
      } catch (error) {
        console.error("Error saving message:", error);
        socket.emit("messageError", { error: "Failed to send message" });
      }
    },
  );

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// Global Error Handler
app.use(require("./middleware/errorHandler.js"));

const PORT = process.env.PORT || 5001;
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("Connected to database successfully");

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

startServer();
