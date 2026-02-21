# VWAP Signal AI - Standalone Edition

Predictive breakout and performance tracking engine based on Weekly VWAP structural levels.

## 🚀 Features
- **Golden Signal Engine**: Real-time detection of high-probability breakouts above Weekly VWAP Max levels.
- **Performance Tracker**: 24h trailing P&L, win rate, and price path sparklines for tracked signals.
- **Telegram Integration**: instant alerts for new Golden and Exit signals.
- **Premium UI**: Ultra-clean, dark glassmorphism aesthetic with Lucide icons and Tailwind CSS.

## 🛠️ Getting Started

1. **Navigate to the project**:
   ```bash
   cd vwap-signal
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## 📂 Project Structure
- `src/components/DecisionBuyAi.tsx`: Core AI signal logic and UI.
- `src/services/cexService.ts`: Binance/KuCoin data engine.
- `src/services/telegramService.ts`: Alert notification system.
- `src/App.tsx`: Main dashboard and data polling orchestrator.

## ⚠️ Disclaimer
This tool is for educational purposes only. Trade at your own risk.
