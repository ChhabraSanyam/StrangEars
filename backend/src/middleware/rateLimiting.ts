import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request, Response } from 'express';

// General API rate limiting
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again later.',
    code: 429,
    timestamp: new Date()
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'TooManyRequests',
      message: 'Too many requests from this IP, please try again later.',
      code: 429,
      timestamp: new Date()
    });
  }
});

// Strict rate limiting for matching requests
export const matchingRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 matching requests per 5 minutes
  message: {
    error: 'TooManyMatchRequests',
    message: 'Too many matching requests. Please wait before trying again.',
    code: 429,
    timestamp: new Date()
  },
  skipSuccessfulRequests: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'TooManyMatchRequests',
      message: 'Too many matching requests. Please wait before trying again.',
      code: 429,
      timestamp: new Date()
    });
  }
});

// Strict rate limiting for report submissions
export const reportRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 reports per 10 minutes
  message: {
    error: 'TooManyReports',
    message: 'Too many reports submitted. Please wait before submitting another report.',
    code: 429,
    timestamp: new Date()
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'TooManyReports',
      message: 'Too many reports submitted. Please wait before submitting another report.',
      code: 429,
      timestamp: new Date()
    });
  }
});

// Speed limiting for API requests (progressive delay)
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per 15 minutes at full speed
  delayMs: () => 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 5000, // Maximum delay of 5 seconds
});

// Admin endpoints rate limiting (more restrictive)
export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 admin requests per 15 minutes
  message: {
    error: 'TooManyAdminRequests',
    message: 'Too many admin requests from this IP, please try again later.',
    code: 429,
    timestamp: new Date()
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'TooManyAdminRequests',
      message: 'Too many admin requests from this IP, please try again later.',
      code: 429,
      timestamp: new Date()
    });
  }
});

// Health check rate limiting (more lenient)
export const healthCheckRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Allow 30 health checks per minute
  message: {
    error: 'TooManyHealthChecks',
    message: 'Too many health check requests.',
    code: 429,
    timestamp: new Date()
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'TooManyHealthChecks',
      message: 'Too many health check requests.',
      code: 429,
      timestamp: new Date()
    });
  }
});