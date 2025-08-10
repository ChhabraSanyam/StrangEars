import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { reportService } from '../services/reportService';
import { SocketService } from '../services/socketService';
import { reportRateLimit, adminRateLimit } from '../middleware/rateLimiting';
import { validate, validateQuery, schemas } from '../middleware/validation';

const router = Router();

// POST /api/report - Submit a report
router.post('/report', reportRateLimit, validate(schemas.reportSubmission), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, reporterType, reason, reporterSocketId } = req.body;

    // Validate required fields
    if (!sessionId) {
      throw new AppError('Session ID is required', 400);
    }

    if (!reporterType || !['venter', 'listener'].includes(reporterType)) {
      throw new AppError('Invalid reporter type. Must be "venter" or "listener"', 400);
    }

    // Get the reported user's socket ID from the session
    let reportedSocketId: string | undefined;
    try {
      const socketService = SocketService.getInstance();
      if (socketService && reporterSocketId) {
        const sessionManager = socketService.getSessionManager();
        const otherParticipant = await sessionManager.getOtherParticipant(sessionId, reporterSocketId);
        reportedSocketId = otherParticipant || undefined;
      }
    } catch (error) {
      console.warn('Could not determine reported user socket ID:', error);
    }

    // Create the report with pattern detection
    const result = await reportService.createReport({
      sessionId,
      reporterType,
      reason,
      reportedSocketId
    });

    // Immediately terminate the session
    try {
      const socketService = SocketService.getInstance();
      if (socketService) {
        await socketService.terminateSession(sessionId, 'reported');
      } else {
        console.warn('Socket service not available for session termination');
      }
    } catch (terminationError) {
      console.error('Error terminating session after report:', terminationError);
      // Continue with report creation even if session termination fails
    }

    // Prepare response
    const response: any = {
      message: 'Report submitted successfully. Session has been terminated.',
      reportId: result.report.id,
      timestamp: result.report.timestamp
    };

    // Include restriction information if applied
    if (result.restriction) {
      response.restrictionApplied = {
        type: result.restriction.restrictionType,
        duration: result.restriction.endTime ? 
          Math.round((result.restriction.endTime.getTime() - result.restriction.startTime.getTime()) / (60 * 1000)) : 
          null,
        reason: result.restriction.reason
      };
    }

    // Include risk analysis for admin purposes (could be logged separately)
    if (result.analysis) {
      console.log(`Pattern analysis for reported user: Risk level ${result.analysis.riskLevel}, Total reports: ${result.analysis.totalReports}`);
    }

    res.status(201).json(response);

  } catch (error) {
    next(error);
  }
});

// GET /api/report/stats - Get report statistics (admin endpoint)
router.get('/report/stats', adminRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await reportService.getEnhancedReportStats();
    
    res.status(200).json({
      ...stats,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/report/recent - Get recent reports (admin endpoint)
router.get('/report/recent', adminRateLimit, validateQuery(schemas.adminQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    if (limit > 100) {
      throw new AppError('Limit cannot exceed 100', 400);
    }

    const reports = await reportService.getRecentReports(limit);
    
    res.status(200).json({
      reports,
      count: reports.length,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/report/:reportId/resolve - Mark report as resolved (admin endpoint)
router.put('/report/:reportId/resolve', adminRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportId } = req.params;

    if (!reportId) {
      throw new AppError('Report ID is required', 400);
    }

    const resolved = await reportService.resolveReport(reportId);

    if (!resolved) {
      throw new AppError('Report not found or already resolved', 404);
    }

    res.status(200).json({
      message: 'Report marked as resolved',
      reportId,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/report/user/:socketId/analysis - Get pattern analysis for a user (admin endpoint)
router.get('/report/user/:socketId/analysis', adminRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { socketId } = req.params;

    if (!socketId) {
      throw new AppError('Socket ID is required', 400);
    }

    const analysis = await reportService.getUserPatternAnalysis(socketId);
    const restriction = await reportService.isUserRestricted(socketId);

    res.status(200).json({
      analysis,
      currentRestriction: restriction,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/report/restrictions/active - Get all active restrictions (admin endpoint)
router.get('/report/restrictions/active', adminRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patternDetectionService } = await import('../services/patternDetectionService');
    const restrictions = await patternDetectionService.getActiveRestrictions();

    res.status(200).json({
      restrictions,
      count: restrictions.length,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/report/restrictions/cleanup - Clean up expired restrictions (admin endpoint)
router.post('/report/restrictions/cleanup', adminRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cleanedCount = await reportService.cleanupExpiredRestrictions();

    res.status(200).json({
      message: `Cleaned up ${cleanedCount} expired restrictions`,
      cleanedCount,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

export default router;