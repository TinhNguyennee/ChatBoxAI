const { getCart, addToCart, removeFromCart, clearCart } = require('../database/cartRepo');
const { isUserVIP } = require('../database/vipRepo');
const { calculateCartPrice } = require('../services/pricingService');
const { getCartKeyboard } = require('../keyboards/cartKeyboards');
const { handleBookDetail } = require('./listHandler');

/**
 * Hiển thị màn hình Giỏ hàng chi tiết kèm bảng tính giá
 */
async function handleViewCart(bot, chatId, messageId = null) {
  try {
    const cartItems = await getCart(chatId);
    const isVIP = await isUserVIP(chatId);

    if (cartItems.length === 0) {
      const emptyText = 
        `🛒 **GIỎ HÀNG CỦA BẠN ĐANG TRỐNG**\n\n` +
        `Bạn chưa chọn cuốn truyện nào. Hãy duyệt danh sách truyện và thêm vào giỏ nhé!`;
      const keyboard = getCartKeyboard([]);

      if (messageId) {
        return bot.editMessageText(emptyText, {
          chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard
        }).catch(async () => {
          await bot.sendMessage(chatId, emptyText, { parse_mode: 'Markdown', reply_markup: keyboard });
        });
      }
      return bot.sendMessage(chatId, emptyText, { parse_mode: 'Markdown', reply_markup: keyboard });
    }

    const { totalOriginal, finalAmount, discountBreakdown } = await calculateCartPrice(cartItems, isVIP);

    let text = `🛒 **GIỎ HÀNG CỦA BẠN (${cartItems.length} cuốn)**\n\n`;
    text += `📋 **Các truyện đã chọn:**\n`;
    cartItems.forEach((b, idx) => {
      const priceStr = b.free ? "🆓 Free" : `${b.price.toLocaleString('vi-VN')}đ`;
      text += `${idx + 1}. #${b.id} *${b.name}* — ${priceStr}\n`;
    });

    text += `\n──────────────\n`;
    text += `💰 **Tổng giá gốc:** ${totalOriginal.toLocaleString('vi-VN')}đ\n`;

    if (discountBreakdown.length > 0) {
      text += `\n🎁 **Ưu đãi áp dụng:**\n`;
      discountBreakdown.forEach(line => {
        text += `• ${line}\n`;
      });
    }

    text += `\n💳 **SỐ TIỀN CẦN THANH TOÁN:** \`${finalAmount.toLocaleString('vi-VN')}đ\`\n`;
    text += `──────────────\n`;
    text += `👉 *Bấm "Tiến Hành Thanh Toán" để nhận mã QR chuyển khoản MB Bank (thời hạn 15 phút).*`;

    const keyboard = getCartKeyboard(cartItems);

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }).catch(async () => {
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
      });
    } else {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  } catch (err) {
    console.error('❌ Lỗi handleViewCart:', err.message);
  }
}

/**
 * Thêm truyện vào giỏ từ màn hình chi tiết truyện
 */
async function handleAddToCart(bot, callbackQuery, bookId, fromPage = 1) {
  const chatId = callbackQuery.message.chat.id;
  await addToCart(chatId, bookId);
  await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Đã thêm vào giỏ hàng!' }).catch(() => {});
  // Cập nhật lại giao diện chi tiết truyện
  await handleBookDetail(bot, chatId, bookId, fromPage, callbackQuery.message.message_id);
}

/**
 * Xóa truyện khỏi giỏ từ màn hình chi tiết truyện
 */
async function handleRemoveFromCart(bot, callbackQuery, bookId, fromPage = 1) {
  const chatId = callbackQuery.message.chat.id;
  await removeFromCart(chatId, bookId);
  await bot.answerCallbackQuery(callbackQuery.id, { text: '🗑️ Đã xóa khỏi giỏ hàng!' }).catch(() => {});
  // Cập nhật lại giao diện chi tiết truyện
  await handleBookDetail(bot, chatId, bookId, fromPage, callbackQuery.message.message_id);
}

/**
 * Xóa một truyện trực tiếp từ màn hình Giỏ hàng
 */
async function handleDropFromCart(bot, callbackQuery, bookId) {
  const chatId = callbackQuery.message.chat.id;
  await removeFromCart(chatId, bookId);
  await bot.answerCallbackQuery(callbackQuery.id, { text: '🗑️ Đã bỏ truyện khỏi giỏ!' }).catch(() => {});
  await handleViewCart(bot, chatId, callbackQuery.message.message_id);
}

/**
 * Xóa sạch toàn bộ giỏ hàng
 */
async function handleClearCart(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  await clearCart(chatId);
  await bot.answerCallbackQuery(callbackQuery.id, { text: '🗑️ Đã dọn sạch giỏ hàng!' }).catch(() => {});
  await handleViewCart(bot, chatId, callbackQuery.message.message_id);
}

module.exports = {
  handleViewCart,
  handleAddToCart,
  handleRemoveFromCart,
  handleDropFromCart,
  handleClearCart
};
