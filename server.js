require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const taskRoutes = require('./routes/taskRoutes');
const aiRoutes   = require('./routes/aiRoutes');

const app  = express();
const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend from public folder
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/tasks', taskRoutes);
app.use('/api/ai',    aiRoutes);

// Fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const cron = require('node-cron');
const { sendDailyDigest } = require('./services/emailService');

// Runs every day at 7:00 AM server time
cron.schedule('0 7 * * *', async () => {
    try {
        await sendDailyDigest();
        console.log('Daily digest email sent.');
    } catch (e) {
        console.error('Failed to send daily digest:', e.message);
    }
});

// Start server
app.listen(PORT, () => {
  console.log('================================================');
  console.log(`  AI Task Manager running at http://localhost:${PORT}`);
  console.log('================================================');
});