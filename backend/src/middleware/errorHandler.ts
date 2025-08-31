import { Request, Response, NextFunction } from 'express';

export interface ErrorResponse {
  error: string;
  message: string;
  code: number;
  timestamp: Date;
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  const errorResponse: ErrorResponse = {
    error: err.name || 'Error',
    message,
    code: statusCode,
    timestamp: new Date()
  };

  // Log error for debugging (in production, use proper logging)
  // Skip logging for restriction errors as they're already logged concisely
  if (!message.includes('restricted')) {
    console.error(`Error ${statusCode}: ${message}`, err.stack);
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: ErrorResponse = {
    error: 'NotFound',
    message: `Route ${req.originalUrl} not found`,
    code: 404,
    timestamp: new Date()
  };

  res.status(404).json(errorResponse);
};