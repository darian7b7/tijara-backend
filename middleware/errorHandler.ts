import { Request, Response, NextFunction, ErrorRequestHandler } from "express";

interface CustomError extends Error {
  status?: number;
}

// Typed error handler
const errorHandler: ErrorRequestHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error("💥 Error Handler:", err.stack);

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

export default errorHandler;
