require('dotenv').config();
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const socketHandler = require('./sockets/socketHandler');

const app = express();
app.set('trust proxy', 1); // Confiar en proxies (Cloudflare, etc)
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Permitir conexiones desde cualquier origen (útil para desarrollo/Tunnel)
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Deshabilitar CSP estricto para facilitar desarrollo rápido de frontend
}));
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Auth Routes
const authController = require('./controllers/authController');
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authController.getProfile);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Socket.io Setup
socketHandler(io);

const PORT = process.env.PORT || 3000;

// Listen on all interfaces (Dual Stack)
server.listen(PORT, () => {
    console.log(`
  ================================================
  🚀 SERVER RUNNING ON PORT ${PORT}
  ================================================
  - Local:   http://localhost:${PORT}
  - Network: http://127.0.0.1:${PORT}
  ================================================
  `);
});

