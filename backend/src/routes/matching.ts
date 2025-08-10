import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { matchingService } from '../services/matchingService';
import { matchingRateLimit } from '../middleware/rateLimiting';
import { validate, schemas } from '../middleware/validation';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /api/match - Request matching
router.post('/match', matchingRateLimit, validate(schemas.matchRequest), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userType, socketId } = req.body;

    // Validate user type
    if (!userType || !['venter', 'listener'].includes(userType)) {
      throw new AppError('Invalid user type. Must be "venter" or "listener"', 400);
    }

    // Validate socket ID (should come from frontend WebSocket connection)
    if (!socketId) {
      throw new AppError('Socket ID is required', 400);
    }

    // Add to queue and attempt matching
    const match = await matchingService.addToQueue(socketId, userType);

    if (match) {
      // Match found immediately - let the WebSocket service handle notification
      // The WebSocket service will send match-found events to both users
      res.status(200).json({
        status: 'matched',
        sessionId: match.sessionId,
        userType,
        timestamp: new Date()
      });
    } else {
      // Added to queue, waiting for match
      const estimatedWaitTime = await matchingService.getEstimatedWaitTime(userType);
      const queueStats = await matchingService.getQueueStats();

      res.status(200).json({
        status: 'queued',
        socketId,
        userType,
        estimatedWaitTime,
        queueStats,
        timestamp: new Date()
      });
    }
  } catch (error) {
    next(error);
  }
});

// DELETE /api/match/:socketId - Cancel matching
router.delete('/match/:socketId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { socketId } = req.params;

    if (!socketId) {
      throw new AppError('Socket ID is required', 400);
    }

    // Remove from queue
    const removed = await matchingService.removeFromQueue(socketId);

    if (removed) {
      res.status(200).json({
        message: 'Match request cancelled successfully',
        socketId,
        timestamp: new Date()
      });
    } else {
      res.status(404).json({
        message: 'Match request not found or already processed',
        socketId,
        timestamp: new Date()
      });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/match/stats - Get queue statistics
router.get('/match/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await matchingService.getQueueStats();
    res.status(200).json({
      ...stats,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

export default router;