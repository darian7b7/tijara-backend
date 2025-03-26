import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import prisma from "./lib/prismaClient.js";
import dotenv from "dotenv";
import morgan from "morgan";
import errorHandler from "./middleware/errorHandler.js";

// Load environment variables
dotenv.config();

// Initialize app and HTTP server
const app = express();
const httpServer = createServer(app);

// Middleware: Security
app.use(helmet());
app.use(compression());

// Middleware: Logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Middleware: CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Middleware: Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Middleware: Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Static: Uploads folder
app.use("/uploads", express.static("uploads"));

// Health Check
app.get("/api/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Import Routes
import authRoutes from "./routes/auth.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import userRoutes from "./routes/user.routes.js";
import messageRoutes from "./routes/message.routes.js";
import uploadRoutes from "./routes/uploads.js";
import notificationRoutes from "./routes/notification.routes.js";

// Register Routes
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messaging", messageRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/notifications", notificationRoutes);

// Socket.io Setup
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

app.set("io", io);

// Socket.io connection handling
io.on("connection", (socket: Socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userId: string) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  socket.on("sendMessage", async (data) => {
    try {
      const message = await prisma.message.create({
        data: {
          content: data.content,
          sender: { connect: { id: data.senderId } },
          recipient: { connect: { id: data.recipientId } },
          conversation: { connect: { id: data.conversationId } },
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

      io.to(data.recipientId).emit("newMessage", message);
      socket.emit("messageSent", message);
    } catch (error) {
      console.error("Error saving message:", error);
      socket.emit("messageError", { error: "Failed to send message" });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Error Handler Middleware (last middleware)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5001;
async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Connected to database");

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    process.on("SIGINT", async () => {
      await prisma.$disconnect();
      console.log("🛑 Gracefully shutting down");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
  }
}

startServer();
