import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes and middleware
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { SocketService } from './services/socketService';
// Import database to ensure schema initialization
import { database } from './config/database';

// Configure allowed origins for CORS
const getAllowedOrigins = () => {
  const origins = [];
  
  // Always allow localhost for development
  origins.push('http://localhost:3000');
  
  // Add production origins from environment variables
  if (process.env.CORS_ORIGIN) {
    const corsOrigins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
    origins.push(...corsOrigins);
  }
  
  return origins;
};

const allowedOrigins = getAllowedOrigins();

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', apiRoutes);

// Apply socket connection throttling
import { socketConnectionThrottle } from './middleware/socketThrottling';
io.use(socketConnectionThrottle);

// Initialize Socket.IO service
const socketService = new SocketService(io);

// Error handling middleware (must be after all routes)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5001;

// Ensure database is initialized before starting server
console.log('Initializing database...');
// The database singleton is already created by the import above
// This will trigger the constructor and create all tables

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Database initialization completed');
});

export { app, server, io, socketService };