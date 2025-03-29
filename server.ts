import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import prisma from "./lib/prismaClient";
import dotenv from "dotenv";
import morgan from "morgan";
import errorHandler from "./middleware/errorHandler";
import { getDirname } from "./utils/path.utils";
const __dirname = getDirname(import.meta.url);

// Load environment variables
dotenv.config();

// Initialize app and HTTP server
const app = express();
const httpServer = createServer(app);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// CORS Configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      "http://localhost:5173", // Vite default port
      "http://localhost:3000", // Alternative port
      "https://tijara-frontend-production.up.railway.app"
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials'
  ]
};

app.use(cors(corsOptions));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Add before your routes
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`📥 ${req.method} ${req.url}`, {
    headers: req.headers,
    body: req.body,
    query: req.query,
  });
  
  // Log response
  const originalSend = res.send;
  res.send = function (body: any) {
    console.log(`📤 Response ${res.statusCode}`, {
      body: body,
    });
    return originalSend.call(this, body);
  };
  
  next();
});

// Error handling middleware
app.use(errorHandler);

// Import Routes
import authRoutes from "./routes/auth.routes";
import listingRoutes from "./routes/listing.routes";
import userRoutes from "./routes/user.routes";
import messageRoutes from "./routes/message.routes";
import uploadRoutes from "./routes/uploads";
import notificationRoutes from "./routes/notification.routes";

// Mount routes directly (no /api prefix)
app.use("/api/auth", authRoutes);
app.use("/listings", listingRoutes);
app.use("/users", userRoutes);
app.use("/messages", messageRoutes);
app.use("/uploads", uploadRoutes);
app.use("/notifications", notificationRoutes);

// Add debug middleware to log all requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`📥 ${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Bearer [hidden]' : 'none',
    }
  });
  next();
});

// Add catch-all route for debugging
app.use((req: Request, res: Response) => {
  console.log(`❌ Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.url}`
    }
  });
});

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

  socket.on("leave", (userId: string) => {
    socket.leave(userId);
    console.log(`User ${userId} left their room`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("✅ Connected to database");

    // Start server
    const port = process.env.PORT || 5001;
    httpServer.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
