const { getOrderById, deleteOrder, getExpiredPendingOrders } = require('../database/ordersRepo');
const { ORDER_STATUS } = require('../config/constants');

const activeTimers = new Map();

/**
 * Đăng ký đếm ngược 15 phút cho đơn hàng mới
 */
function scheduleOrderExpiration(bot, orderId, chatId, delayMs = 15 * 60 * 1000) {
  // Hủy timer cũ nếu có
  if (activeTimers.has(orderId)) {
    clearTimeout(activeTimers.get(orderId));
  }

  const timer = setTimeout(async () => {
    activeTimers.delete(orderId);
    await handleOrderExpired(bot, orderId, chatId);
  }, delayMs);

  activeTimers.set(orderId, timer);
}

/**
 * Hủy đếm ngược khi đơn đã thanh toán hoặc bị hủy thủ công
 */
function cancelExpirationTimer(orderId) {
  if (activeTimers.has(orderId)) {
    clearTimeout(activeTimers.get(orderId));
    activeTimers.delete(orderId);
  }
}

/**
 * Xử lý khi đơn hàng quá 15 phút: Thông báo cho user và xóa đơn khỏi Neon DB
 */
async function handleOrderExpired(bot, orderId, chatId) {
  try {
    const order = await getOrderById(orderId);
    if (!order || order.status !== ORDER_STATUS.PENDING) {
      return;
    }

    console.log(`⏰ Đơn hàng [${orderId}] đã hết hạn 15 phút -> Đang xử lý hủy & dọn dẹp...`);

    // 1. Gửi thông báo tới User
    if (chatId || order.telegram_id) {
      const targetChatId = chatId || order.telegram_id;
      const expireMsg = 
        `⚠️ **ĐƠN HÀNG ĐÃ HẾT HẠN!**\n\n` +
        `Đơn hàng \`${orderId}\` đã quá thời hạn thanh toán 15 phút.\n` +
        `⛔ **Vui lòng KHÔNG chuyển khoản vào đơn này nữa!**\n\n` +
        `Nếu bạn vẫn muốn mua, vui lòng mở lại Giỏ hàng để tạo đơn mới nhé. ❤️`;

      await bot.sendMessage(targetChatId, expireMsg, { parse_mode: 'Markdown' }).catch((e) => {
        console.error(`Không thể gửi thông báo hết hạn đơn ${orderId}:`, e.message);
      });
    }

    // 2. Xóa đơn khỏi bảng orders để tiết kiệm dung lượng lưu trữ Neon DB
    await deleteOrder(orderId);
    console.log(`🗑️ Đã xóa đơn hết hạn [${orderId}] khỏi cơ sở dữ liệu.`);
  } catch (err) {
    console.error(`❌ Lỗi khi xử lý đơn hết hạn (${orderId}):`, err.message);
  }
}

/**
 * Tiến trình quét định kỳ dọn dẹp các đơn PENDING bị treo (chạy mỗi 1 phút)
 */
function startExpirationWorker(bot) {
  // Quét ngay khi khởi động
  sweepExpiredOrders(bot);

  // Lặp lại mỗi 60 giây
  setInterval(() => {
    sweepExpiredOrders(bot);
  }, 60 * 1000);
}

/**
 * Quét cơ sở dữ liệu và xử lý các đơn quá hạn
 */
async function sweepExpiredOrders(bot) {
  try {
    const expiredOrders = await getExpiredPendingOrders();
    for (const order of expiredOrders) {
      await handleOrderExpired(bot, order.order_id, order.telegram_id);
    }
  } catch (err) {
    console.error('❌ Lỗi khi quét đơn hết hạn định kỳ:', err.message);
  }
}

module.exports = {
  scheduleOrderExpiration,
  cancelExpirationTimer,
  startExpirationWorker
};
