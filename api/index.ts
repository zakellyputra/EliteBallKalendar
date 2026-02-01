// Vercel serverless function wrapper for Express app
import '../server/env';
import express from 'express';
import cors from 'cors';

// Import routes
import authRoutes from '../server/routes/auth';
import calendarRoutes from '../server/routes/calendar';
import settingsRoutes from '../server/routes/settings';
import goalsRoutes from '../server/routes/goals';
import schedulerRoutes from '../server/routes/scheduler';
import rescheduleRoutes from '../server/routes/reschedule';
import voiceRoutes from '../server/routes/voice';
import statsRoutes from '../server/routes/stats';

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins for Vercel
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes - Vercel strips /api prefix, so routes are mounted at root
app.use('/auth', authRoutes);
app.use('/calendar', calendarRoutes);
app.use('/settings', settingsRoutes);
app.use('/goals', goalsRoutes);
app.use('/scheduler', schedulerRoutes);
app.use('/reschedule', rescheduleRoutes);
app.use('/voice', voiceRoutes);
app.use('/stats', statsRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

export default app;
