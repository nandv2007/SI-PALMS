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
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api', fileRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/blockchain', blockchainRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'SI-PALMS MySQL Backend Operational', timestamp: new Date().toISOString() });
});

async function startServer() {
  try {
    // Initialize Database & Seed Data
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`  SI-PALMS MySQL Backend Running on Port ${PORT}`);
      console.log(`  Health Check: http://localhost:${PORT}/api/health`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('Failed to initialize server:', err);
  }
}

startServer();
