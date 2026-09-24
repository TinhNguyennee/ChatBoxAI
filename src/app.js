const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const { BOT_TOKEN, PORT, RENDER_EXTERNAL_URL } = require('./config/env');
const { runMigrations } = require('./database/migrate');
const { processSepayWebhook } = require('./services/sepayService');
const { startExpirationWorker } = require('./services/orderExpirationService');

const { handleStart } = require('./handlers/startHandler');
const { handleBookList } = require('./handlers/listHandler');
const { handleViewCart } = require('./handlers/cartHandler');
const { handleMyBooks } = require('./handlers/myBooksHandler');
const { handleCallbackQuery } = require('./handlers/callbackHandler');
const {
  handleAdminDashboard,
  handleSetEventCommand,
  handleStopEventCommand,
  handleAddVIPCommand,
  handleDelVIPCommand,
  handleBroadcastCommand
} = require('./handlers/adminHandler');

// ======================
//   KHỞI TẠO TELEGRAM BOT
// ======================
const isPolling = process.env.NODE_ENV === 'development' || process.env.USE_POLLING === 'true';
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// ======================
//   EXPRESS SERVER & WEBHOOK
// ======================
const app = express();
app.use(bodyParser.json());

// Endpoint kiểm tra hoạt động của server (Health check)
app.get('/ping', (req, res) => res.send('alive'));

// Endpoint nhận Webhook từ SePay khi có biến động số dư ngân hàng
app.post('/sepay', async (req, res) => {
  console.log('📨 Webhook SePay nhận dữ liệu:', JSON.stringify(req.body, null, 2));
  const authHeader = req.headers['authorization'] || '';
  const result = await processSepayWebhook(bot, req.body, authHeader);
  res.status(result.status || 200).send(result.message || 'ok');
});

// Endpoint nhận Webhook Telegram từ Render
if (!isPolling && BOT_TOKEN) {
  app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

// ======================
//   ĐĂNG KÝ CÁC LỆNH BOT
// ======================

// 1. Menu chính
bot.onText(/\/start/, (msg) => handleStart(bot, msg));

// 2. Xem danh sách truyện
bot.onText(/\/list/, (msg) => handleBookList(bot, msg.chat.id, 1));

// 3. Xem giỏ hàng
bot.onText(/\/cart/, (msg) => handleViewCart(bot, msg.chat.id));

// 4. Tủ truyện của tôi
bot.onText(/\/mytruyen/, (msg) => handleMyBooks(bot, msg.chat.id, 1));

// 5. Kiểm tra ID người dùng
bot.onText(/\/id/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username ? `@${msg.from.username}` : "Không có username";
  const text = `🆔 **Telegram ID của bạn là:**\n\n\`${chatId}\`\n\n📌 Username: ${username}`;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// 6. Lệnh Quản trị viên (Admin)
bot.onText(/\/admin/, (msg) => handleAdminDashboard(bot, msg.chat.id));
bot.onText(/\/setevent (.+)/, (msg, match) => handleSetEventCommand(bot, msg, match));
bot.onText(/\/stopevent/, (msg) => handleStopEventCommand(bot, msg));
bot.onText(/\/addvip (.+)/, (msg, match) => handleAddVIPCommand(bot, msg, match));
bot.onText(/\/delvip (.+)/, (msg, match) => handleDelVIPCommand(bot, msg, match));
bot.onText(/\/broadcast (.+)/, (msg, match) => handleBroadcastCommand(bot, msg, match));

// 7. Xử lý tất cả các sự kiện bấm nút (Callback Query)
bot.on('callback_query', (callbackQuery) => handleCallbackQuery(bot, callbackQuery));

// Global Error Handlers
bot.on('error', (err) => console.error('❌ Bot error:', err.message));
bot.on('polling_error', (err) => console.error('❌ Polling error:', err.message));

process.on('unhandledRejection', (reason) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});

/**
 * Khởi động toàn bộ ứng dụng
 */
async function startApp() {
  try {
    // 1. Chạy migrations an toàn (chỉ tạo bảng nếu chưa có, tuyệt đối không xóa dữ liệu)
    await runMigrations();

    // 2. Khởi chạy worker dọn dẹp và nhắc nhở đơn hàng quá hạn 15 phút
    startExpirationWorker(bot);

    // 3. Khởi động Webhook hoặc Polling
    if (isPolling && BOT_TOKEN) {
      try {
        await bot.deleteWebHook();
        console.log('🔄 Đã xóa Webhook cũ trên Telegram để chuyển sang Polling.');
      } catch (e) {
        // bỏ qua nếu chưa từng set webhook
      }
      await bot.startPolling();
      console.log('🚀 Bot đang chạy ở chế độ POLLING (Development local)');
    } else if (!isPolling && BOT_TOKEN && RENDER_EXTERNAL_URL) {
      const webhookUrl = `${RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`;
      await bot.setWebHook(webhookUrl);
      console.log(`✅ Webhook Telegram đã được kích hoạt tại: ${webhookUrl}`);
    }

    // 4. Khởi động Web Server Express
    app.listen(PORT, () => {
      console.log(`🚀 Web Server đang lắng nghe trên cổng: ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Khởi động ứng dụng thất bại:', err.message);
  }
}

module.exports = {
  app,
  bot,
  startApp
};
