import { Router } from 'express';
import matchingRoutes from './matching';
import reportRoutes from './report';
import { generalRateLimit, speedLimiter, healthCheckRateLimit } from '../middleware/rateLimiting';
import { apiSpamPrevention } from '../middleware/spamPrevention';

const router = Router();

// Apply general rate limiting and spam prevention to all routes
router.use(generalRateLimit);
router.use(speedLimiter);
router.use(apiSpamPrevention);

// Health check endpoint with specific rate limiting
router.get('/health', healthCheckRateLimit, (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'StrangEars API is running',
    timestamp: new Date()
  });
});

// Matching service routes
router.use('/', matchingRoutes);

// Report service routes
router.use('/', reportRoutes);

export default router;