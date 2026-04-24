# Paper Portfolio

A modern paper trading platform with real-time market data, MPIN authentication, and comprehensive portfolio management.

## Features

### 🚀 Core Features
- **Real-time Market Data**: Live stock prices during market hours (9:15 AM - 3:30 PM IST) with adaptive caching
- **MPIN Authentication**: Quick 4-digit PIN login system like Groww
- **Portfolio Management**: Track holdings, P&L, and performance analytics
- **Watchlists**: Create and manage multiple watchlists with global stock search
- **Trading Terminal**: Advanced trading interface with charts and order placement
- **Admin Dashboard**: User management and platform statistics

### 📊 Market Data
- **Adaptive Polling**: 10-second updates during market hours, 5-minute intervals outside
- **Market Status Indicator**: Visual indicator showing Open/Closed/Pre-market/After hours
- **Bulk Live Quotes**: Single API call for all user-relevant symbols
- **Closing Price Persistence**: Last closing values displayed consistently outside market hours

### 🔐 Authentication
- **Email + Password**: Traditional login
- **4-digit MPIN**: Quick login with secure PIN system
- **Auto-redirect**: MPIN setup flow after registration
- **Role-based Access**: Admin vs regular user permissions

### 💼 Portfolio Features
- **Holdings Table**: Stock name, current price, P&L, quantity, average price
- **P&L Visualization**: Waterfall charts and breakdown by stock
- **Sector Allocation**: Pie chart showing portfolio diversification
- **Performance History**: Track portfolio value over time
- **Real-time Updates**: Live price updates across all portfolio views

### 📱 UI/UX
- **Responsive Design**: Mobile-first with desktop enhancements
- **Dark Mode**: Complete dark theme support
- **Global Search**: Universal stock search with add-to-watchlist
- **Market Badge**: Pulsing indicator for market status
- **Toast Notifications**: User-friendly feedback system

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **TailwindCSS** for styling
- **Zustand** for state management
- **Recharts** for data visualization
- **React Router** for navigation
- **Axios** for API calls

### Backend
- **Node.js** with TypeScript
- **Express** for REST API
- **SQLite** for database with sql.js
- **JWT** for authentication
- **bcrypt** for password hashing
- **Yahoo Finance API** for market data
- **node-cron** for scheduled tasks

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "Paper Trading New"
   ```

2. **Install dependencies**
   ```bash
   # Install server dependencies
   cd server
   npm install

   # Install client dependencies
   cd ../client
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Server environment
   cd server
   cp .env.example .env
   # Edit .env with your configuration

   # Client environment (optional)
   cd ../client
   cp .env.example .env
   ```

4. **Database Setup**
   - SQLite database is created automatically on first run
   - No external database required

### Running the Application

1. **Start the server**
   ```bash
   cd server
   npm run dev
   ```

2. **Start the client** (in another terminal)
   ```bash
   cd client
   npm run dev
   ```

3. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/login-mpin` - MPIN login
- `POST /api/auth/set-mpin` - Set/change MPIN
- `GET /api/auth/me` - Get current user

### Market Data
- `GET /api/stocks/search?q=query` - Search stocks
- `GET /api/stocks/market-status` - Market hours and status
- `GET /api/stocks/live` - Bulk live quotes
- `GET /api/stocks/:symbol` - Single stock quote

### Portfolio
- `GET /api/portfolio` - User portfolio and holdings
- `GET /api/portfolio/history` - Portfolio value history

### Watchlists
- `GET /api/watchlists` - User watchlists
- `POST /api/watchlists` - Create watchlist
- `POST /api/watchlists/:id/items` - Add stock to watchlist
- `DELETE /api/watchlists/:id/items/:symbol` - Remove from watchlist

## Development

### Project Structure
```
Paper Trading New/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── store/        # Zustand stores
│   │   └── lib/          # Utilities
├── server/                # Node.js backend
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── middleware/    # Express middleware
│   │   └── db/           # Database setup
└── README.md
```

### Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Market Hours

- **Trading Hours**: 9:15 AM - 3:30 PM IST
- **Trading Days**: Monday - Friday
- **Data Updates**: 
  - Live: Every 10 seconds during market hours
  - Cached: Every 5 minutes outside market hours

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
