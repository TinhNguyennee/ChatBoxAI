const { handleStart, handleUserAccount, handleSupportInfo } = require('./startHandler');
const { handleBookList, handleBookDetail, handleReadFreeBook, handleReadOwnedBook } = require('./listHandler');
const { handleViewCart, handleAddToCart, handleRemoveFromCart, handleDropFromCart, handleClearCart } = require('./cartHandler');
const { handleCheckoutCart, handleBuyVIP, handleCheckOrder, handleCancelOrder } = require('./checkoutHandler');
const { handleMyBooks } = require('./myBooksHandler');
const { 
  handleAdminDashboard, 
  handleAdminStats, 
  handleAdminEvent, 
  handleAdminVipPrompt, 
  handleAdminBroadcastPrompt 
} = require('./adminHandler');

/**
 * Điều hướng tập trung tất cả các sự kiện callback_query từ nút bấm Telegram
 */
async function handleCallbackQuery(bot, callbackQuery) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  // Tránh vòng xoay loading trên nút
  if (data === 'noop') {
    return bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
  }

  try {
    // 1. Menu chính
    if (data === 'nav_main') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleStart(bot, callbackQuery, true);
    }

    // 2. Danh sách truyện
    if (data.startsWith('nav_list:')) {
      const page = parseInt(data.split(':')[1], 10) || 1;
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleBookList(bot, chatId, page, messageId);
    }

    // 3. Chi tiết truyện
    if (data.startsWith('book_detail:')) {
      const parts = data.split(':');
      const bookId = parseInt(parts[1], 10);
      const fromPage = parseInt(parts[2], 10) || 1;
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleBookDetail(bot, chatId, bookId, fromPage, messageId);
    }

    // 4. Đọc truyện miễn phí trực tiếp
    if (data.startsWith('read_free:')) {
      const bookId = parseInt(data.split(':')[1], 10);
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleReadFreeBook(bot, chatId, bookId);
    }

    // 5. Mở truyện đã mua
    if (data.startsWith('read_owned:')) {
      const bookId = parseInt(data.split(':')[1], 10);
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleReadOwnedBook(bot, chatId, bookId);
    }

    // 6. Giỏ hàng
    if (data === 'view_cart') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleViewCart(bot, chatId, messageId);
    }

    if (data.startsWith('cart_add:')) {
      const parts = data.split(':');
      const bookId = parseInt(parts[1], 10);
      const fromPage = parseInt(parts[2], 10) || 1;
      return handleAddToCart(bot, callbackQuery, bookId, fromPage);
    }

    if (data.startsWith('cart_remove:')) {
      const parts = data.split(':');
      const bookId = parseInt(parts[1], 10);
      const fromPage = parseInt(parts[2], 10) || 1;
      return handleRemoveFromCart(bot, callbackQuery, bookId, fromPage);
    }

    if (data.startsWith('cart_drop:')) {
      const bookId = parseInt(data.split(':')[1], 10);
      return handleDropFromCart(bot, callbackQuery, bookId);
    }

    if (data === 'cart_clear') {
      return handleClearCart(bot, callbackQuery);
    }

    // 7. Thanh toán & Đơn hàng
    if (data === 'checkout_start') {
      return handleCheckoutCart(bot, callbackQuery);
    }

    if (data === 'buy_vip') {
      return handleBuyVIP(bot, callbackQuery);
    }

    if (data.startsWith('order_check:')) {
      const orderId = data.substring('order_check:'.length);
      return handleCheckOrder(bot, callbackQuery, orderId);
    }

    if (data.startsWith('order_cancel:')) {
      const orderId = data.substring('order_cancel:'.length);
      return handleCancelOrder(bot, callbackQuery, orderId);
    }

    // 8. Tủ truyện của tôi
    if (data.startsWith('my_books:')) {
      const page = parseInt(data.split(':')[1], 10) || 1;
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleMyBooks(bot, chatId, page, messageId);
    }

    // 9. Tài khoản & Thông tin
    if (data === 'user_account') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleUserAccount(bot, callbackQuery);
    }

    if (data === 'support_info') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleSupportInfo(bot, callbackQuery);
    }

    if (data === 'vip_info') {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '💎 Bạn đang là VIP Member! Mọi đơn mua truyện đều được giảm 50% tự động.',
        show_alert: true
      }).catch(() => {});
    }

    // 10. Quản trị Admin
    if (data === 'admin_dashboard') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleAdminDashboard(bot, chatId, messageId);
    }

    if (data === 'admin_stats') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleAdminStats(bot, chatId, messageId);
    }

    if (data === 'admin_event') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleAdminEvent(bot, chatId, messageId);
    }

    if (data === 'admin_vip_prompt') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleAdminVipPrompt(bot, chatId, messageId);
    }

    if (data === 'admin_broadcast_prompt') {
      await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
      return handleAdminBroadcastPrompt(bot, chatId, messageId);
    }

    // Mặc định phản hồi để không bị treo nút
    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
  } catch (err) {
    console.error(`❌ Lỗi xử lý callbackQuery (${data}):`, err.message);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Có lỗi xảy ra, vui lòng thử lại!' }).catch(() => {});
  }
}

module.exports = {
  handleCallbackQuery
};
