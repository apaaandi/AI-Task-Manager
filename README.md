# AI Task Manager

A full-stack task management app with AI-powered scheduling assistance. Users manage tasks with due times and durations, and an integrated AI assistant (Groq/LLaMA) helps plan, prioritize, and answer questions about the day's schedule, factoring in real travel time between task locations.

## Features

- **JWT authentication** for secure user accounts
- **Task management** with due times, durations, and location-aware scheduling
- **AI chat assistant** powered by Groq/LLaMA for natural-language task planning
- **Travel time calculation** using OSRM and Nominatim to account for real-world commute time between tasks
- **Automated reminders** via node-cron and Nodemailer email notifications
- **SQLite** for lightweight, file-based persistence

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite
- **AI:** Groq API (LLaMA models)
- **Frontend:** Vanilla JavaScript, HTML, CSS
- **Auth:** JWT
- **Scheduling/Notifications:** node-cron, Nodemailer
- **Location/Routing:** OSRM, Nominatim

## Project Structure

```
AI_Task_Manager/
├── dao/              # Data access layer (SQLite queries)
├── db/               # Database connection and setup
├── public/            # Frontend static files (HTML/CSS/JS)
├── routes/           # Express route handlers (tasks, AI chat)
├── services/         # Email and other supporting services
└── server.js          # App entry point
```

## Getting Started

### Prerequisites

- Node.js installed
- A Groq API key ([console.groq.com](https://console.groq.com))

### Installation

1. Clone the repo
   ```
   git clone https://github.com/apaaandi/AI-Task-Manager.git
   cd AI-Task-Manager
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the project root with the following variables:
   ```
   GROQ_API_KEY=your_groq_api_key
   JWT_SECRET=your_jwt_secret
   PORT=3000
   ```

4. Start the server
   ```
   node server.js
   ```

5. Open `http://localhost:3000` in your browser

## How It Works

Tasks are stored with a due time, estimated duration, and optional location. When a user asks the AI assistant to help plan their day, the app calculates travel windows using OSRM/Nominatim so the AI's suggestions account for realistic commute times between tasks, not just raw scheduling gaps.

## Future Improvements

- Multi-user calendar sharing
- Recurring task support
- Mobile-responsive UI refinements