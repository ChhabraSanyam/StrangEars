import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';

// Input sanitization function
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    // Remove potentially dangerous HTML/script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Limit length to prevent DoS
    .substring(0, 10000);
};

// Validation schemas
export const schemas = {
  matchRequest: Joi.object({
    userType: Joi.string().valid('venter', 'listener').required(),
    socketId: Joi.string().min(1).max(100).required(),
    userSessionId: Joi.string().uuid().optional()
  }),

  reportSubmission: Joi.object({
    sessionId: Joi.string().uuid().required(),
    reporterType: Joi.string().valid('venter', 'listener').required(),
    reason: Joi.string().min(1).max(500).required(),
    reporterSocketId: Joi.string().min(1).max(100).optional()
  }),

  socketMessage: Joi.object({
    sessionId: Joi.string().uuid().required(),
    content: Joi.string().min(1).max(1000).required()
  }),

  joinSession: Joi.object({
    sessionId: Joi.string().uuid().required(),
    userType: Joi.string().valid('venter', 'listener').required(),
    username: Joi.string().min(1).max(50).optional(),
    profilePhoto: Joi.string().max(200 * 1024).optional(), // Max 200KB base64
    userSessionId: Joi.string().uuid().optional()
  }),

  endSession: Joi.object({
    sessionId: Joi.string().uuid().required()
  }),

  typing: Joi.object({
    sessionId: Joi.string().uuid().required(),
    isTyping: Joi.boolean().required()
  }),

  adminQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional()
  })
};

// Generic validation middleware factory
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      return next(new AppError(`Validation error: ${errorMessage}`, 400));
    }

    // Sanitize string inputs
    req.body = sanitizeInputs(value);
    next();
  };
};

// Query parameter validation middleware factory
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      return next(new AppError(`Query validation error: ${errorMessage}`, 400));
    }

    req.query = value;
    next();
  };
};

// Recursively sanitize all string inputs in an object
const sanitizeInputs = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(sanitizeInputs);
  } else if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeInputs(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
};

// Socket event validation helper
export const validateSocketData = (data: any, schema: Joi.ObjectSchema): { isValid: boolean; error?: string; sanitizedData?: any } => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorMessage = error.details
      .map(detail => detail.message)
      .join(', ');
    
    return {
      isValid: false,
      error: `Validation error: ${errorMessage}`
    };
  }

  return {
    isValid: true,
    sanitizedData: sanitizeInputs(value)
  };
};

// Content filtering for chat messages
export const filterContent = (content: string): { isAllowed: boolean; filteredContent: string; reason?: string } => {
  const sanitized = sanitizeInput(content);
  
  // Check for empty content after sanitization
  if (!sanitized || sanitized.trim().length === 0) {
    return {
      isAllowed: false,
      filteredContent: '',
      reason: 'Empty message after sanitization'
    };
  }

  // Check for excessive length
  if (sanitized.length > 1000) {
    return {
      isAllowed: false,
      filteredContent: sanitized.substring(0, 1000),
      reason: 'Message too long'
    };
  }

  // Basic spam detection (repeated characters)
  const repeatedCharPattern = /(.)\1{10,}/g;
  if (repeatedCharPattern.test(sanitized)) {
    return {
      isAllowed: false,
      filteredContent: sanitized.replace(repeatedCharPattern, '$1$1$1'),
      reason: 'Excessive repeated characters detected'
    };
  }

  // Check for excessive caps (more than 70% uppercase)
  const uppercaseRatio = (sanitized.match(/[A-Z]/g) || []).length / sanitized.length;
  if (sanitized.length > 10 && uppercaseRatio > 0.7) {
    return {
      isAllowed: true,
      filteredContent: sanitized.toLowerCase(),
      reason: 'Excessive caps converted to lowercase'
    };
  }

  return {
    isAllowed: true,
    filteredContent: sanitized
  };
};