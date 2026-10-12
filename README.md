# Blue Shop — Termux starter

## 1. Install in Termux
```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts git nano -y
cd ~
mkdir -p shop-app
# Put/extract these project files inside ~/shop-app
cd ~/shop-app
npm install
cp .env.example .env
nano .env
```

Set `ADMIN_PASSWORD` and `SESSION_SECRET` to private, long values. Leave Telegram values blank until the bot is configured. Never publish your `.env` file.

## 2. Start locally
```bash
npm start
```
Open `http://127.0.0.1:3000` in your phone browser. Keep Termux running.

## 3. Telegram notifications
1. In Telegram, open the verified `@BotFather`, create a bot with `/newbot`, and copy its token.
2. Start a chat with your new bot and send it `/start`.
3. Get your chat ID using a trusted Telegram bot/API method; do not share the token with anyone.
4. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`, save, then restart the server.
5. Keep the bot token private. For a group, add the bot and use that group's chat ID.

## 4. Public hosting
This is a development starter, not production-hardened. For public hosting, use a Node.js host with HTTPS, persistent storage, environment-variable settings, backups, and a persistent disk for uploaded images. Do not rely on a phone running Termux as a 24/7 production server. The default Express session store and JSON data file are for initial testing only; migrate to a persistent database and a production session store before real public sales.

## Included
- Responsive white/blue storefront
- Categories, search, product cards and image uploads
- Product creation, price/stock editing and deletion behind admin login
- Customer order form and order-status management
- Optional Telegram notifications to the shop owner
- JSON file persistence for the starter version

## Important
The sample products and prices are demo data. Replace them with your own accurate products and ETB prices. The order flow does not process payments or verify screenshots automatically. Admin must verify payment and confirm orders. Do not request customer banking PINs, passwords or one-time codes.
