require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes        = require('./routes/auth');
const gamesRoutes       = require('./routes/games');
const tournamentsRoutes = require('./routes/tournaments');
const adminRoutes       = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/icons');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth',        authRoutes);
app.use('/api/games',       gamesRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/admin',       adminRoutes);

app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
});
