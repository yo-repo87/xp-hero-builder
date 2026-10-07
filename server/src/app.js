import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import savesRoutes from './routes/saves.js';
import forumRoutes from './routes/forum.js';

const app = express();

app.use(
  cors({
    origin: [process.env.FRONTEND_ORIGIN, 'http://localhost:8080'],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/saves', savesRoutes);
app.use('/forum', forumRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
