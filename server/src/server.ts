import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import caseRoutes from './routes/cases.js';
import fileRoutes from './routes/files.js';
import logRoutes from './routes/logs.js';
import blockchainRoutes from './routes/blockchain.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'SI-PALMS Backend Operational',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api', fileRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/blockchain', blockchainRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);

  res.status(500).json({
    status: 'ERROR',
    message: 'Internal server error'
  });
});

async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log('===============================================');
      console.log('        SI-PALMS BACKEND');
      console.log('===============================================');
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: /api/health`);
      console.log('===============================================');
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

startServer();