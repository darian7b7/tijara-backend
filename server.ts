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
import { getDirname } from "./utils/path.utils.js";
const __dirname = getDirname(import.meta.url);

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
const allowedOrigins = [
  "https://tijara-frontend.vercel.app",
  "https://tijara-frontend-git-main.vercel.app",
  "https://tijara-frontend-*.vercel.app",
  ...(process.env.NODE_ENV === "development" 
    ? ["http://localhost:3000", "http://localhost:5173"] 
    : [])
].filter(Boolean); // Filter out undefined values

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (!allowedOrigin) return false;
      if (allowedOrigin.includes("*")) {
        const pattern = new RegExp(
          "^" + allowedOrigin.replace("*", ".*") + "$"
        );
        return pattern.test(origin);
      }
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`Blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));

// Enable pre-flight requests for all routes
app.options("*", cors());

// Middleware: Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser middleware
app.use(cookieParser());

// Configure secure cookie settings
app.use((req, res, next) => {
  res.cookie = res.cookie.bind(res);
  const originalSetCookie = res.setHeader.bind(res, "Set-Cookie");
  res.setHeader = function (name: string, value: any) {
    if (name.toLowerCase() === "set-cookie") {
      if (Array.isArray(value)) {
        value = value.map((v) => v + "; SameSite=None; Secure");
      } else if (typeof value === "string") {
        value = value + "; SameSite=None; Secure";
      }
    }
    return originalSetCookie(value);
  };
  next();
});

// Middleware: Rate Limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // Allow more requests
  message: "Too many requests, please try again later.",
});
app.use(limiter);

// Static: Uploads folder
app.use(
  "/uploads",
  express.static(new URL("uploads", import.meta.url).pathname),
);

// Health Check
app.get("/health", (req: Request, res: Response) => {
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
app.use("/auth", authRoutes);
app.use("/listings", listingRoutes);
app.use("/users", userRoutes);
app.use("/messaging", messageRoutes);
app.use("/uploads", uploadRoutes);
app.use("/notifications", notificationRoutes);

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
