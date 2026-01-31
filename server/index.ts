import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth';
import calendarRoutes from './routes/calendar';
import settingsRoutes from './routes/settings';
import goalsRoutes from './routes/goals';
import schedulerRoutes from './routes/scheduler';
import rescheduleRoutes from './routes/reschedule';
import voiceRoutes from './routes/voice';
import statsRoutes from './routes/stats';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Prisma
export const prisma = new PrismaClient();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/reschedule', rescheduleRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/stats', statsRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
