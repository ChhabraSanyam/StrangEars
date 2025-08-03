import { Router } from 'express';
import matchingRoutes from './matching';
import reportRoutes from './report';

const router = Router();

// Health check endpoint (moved from main index.ts for better organization)
router.get('/health', (req, res) => {
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