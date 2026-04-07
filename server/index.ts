import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import dataRouter from './routes/data.js';
import marketDataRouter from './routes/market-data.js';
import evaluateRouter from './routes/evaluate.js';
import evaluationsRouter from './routes/evaluations.js';
import backtestRouter from './routes/backtest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Importing db triggers table creation on first run
void db;

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.use('/api', dataRouter);
app.use('/api', marketDataRouter);
app.use('/api', evaluateRouter);
app.use('/api', evaluationsRouter);
app.use('/api/backtest', backtestRouter);

const clientDist = path.join(__dirname, '../dist/client');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
