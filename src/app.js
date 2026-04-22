require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const db = require('./models');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { initCronJobs } = require('./services/cronService');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: true, // Echoes the requester's origin
    methods: ['GET', 'POST'],
    credentials: true
  },
});

// Make io accessible in routes
app.set('io', io);

// Middleware
app.set('trust proxy', true); // Essential for ngrok/proxies
app.use(helmet({ 
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'ngrok-skip-browser-warning'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Socket.io events
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-court', (courtId) => {
    socket.join(`court-${courtId}`);
  });

  socket.on('join-venue', (venueId) => {
    socket.join(`venue-${venueId}`);
    console.log(`🏢 Owner/Staff joined venue: ${venueId}`);
  });

  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`👤 User joined private room: ${userId}`);
  });

  socket.on('join-admin', () => {
    socket.join('admin-room');
    console.log('🛡️ Admin joined portal');
  });

  socket.on('leave-court', (courtId) => {
    socket.leave(`court-${courtId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

// Connect DB and start server
db.sequelize.authenticate()
  .then(async () => {
    console.log('✅ Database connected successfully');
    // Auto-sync in dev (use migrations in prod)
    if (process.env.NODE_ENV === 'development') {
      try {
        // Disabled completely to avoid "Too many keys" error after manual fix
        // await db.sequelize.sync({ alter: false });
        console.log('✅ Database sync skipped (manual fix applied)');
      } catch (syncErr) {
        console.error('❌ Database sync error:', syncErr);
      }
    }
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      initCronJobs();
    });
  })
  .catch((err) => {
    console.error('❌ Unable to connect to database:', err.message);
    process.exit(1);
  });

module.exports = { app, io };
