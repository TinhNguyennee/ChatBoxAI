const { getCart, addToCart, removeFromCart, clearCart } = require('../database/cartRepo');
const { isUserVIP } = require('../database/vipRepo');
const { calculateCartPrice } = require('../services/pricingService');
const { getCartKeyboard } = require('../keyboards/cartKeyboards');
const { handleBookDetail } = require('./listHandler');

/**
 * Hiển thị màn hình Giỏ hàng chi tiết kèm bảng tính giá (Gọn gàng, thoáng đãng, chống tràn)
 */
async function handleViewCart(bot, chatId, messageId = null) {
  try {
    const [cartItems, isVIP] = await Promise.all([
      getCart(chatId),
      isUserVIP(chatId)
    ]);

    if (cartItems.length === 0) {
      const emptyText = 
        `🛒 <b>GIỎ HÀNG CỦA BẠN ĐANG TRỐNG</b>\n\n` +
        `Bạn chưa chọn cuốn truyện nào. Hãy duyệt danh sách truyện và thêm vào giỏ nhé!`;
      const keyboard = getCartKeyboard([]);

      const options = {
        parse_mode: 'HTML',
        reply_markup: keyboard
      };

      if (messageId) {
        return bot.editMessageText(emptyText, {
          chat_id: chatId, message_id: messageId, ...options
        }).catch(async () => {
          await bot.sendMessage(chatId, emptyText, options);
        });
      }
      return bot.sendMessage(chatId, emptyText, options);
    }

    const { totalOriginal, finalAmount, discountBreakdown } = await calculateCartPrice(cartItems, isVIP);

    let text = `🛒 <b>GIỎ HÀNG CỦA BẠN (${cartItems.length} cuốn)</b>\n\n`;
    text += `📋 <b>Danh sách truyện đã chọn:</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    cartItems.forEach((b, idx) => {
      const priceStr = b.free ? "🆓 Free" : `${b.price.toLocaleString('vi-VN')}đ`;
      const shortName = b.name.length > 25 ? b.name.substring(0, 23) + '..' : b.name;
      text += `${idx + 1}. #${b.id} <b>${escapeHtml(shortName)}</b> — <code>${priceStr}</code>\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━\n`;

    text += `💰 <b>Tổng giá gốc:</b> ${totalOriginal.toLocaleString('vi-VN')}đ\n`;

    if (discountBreakdown.length > 0) {
      text += `\n🎁 <b>Ưu đãi áp dụng:</b>\n`;
      discountBreakdown.forEach(line => {
        text += `• ${escapeHtml(line)}\n`;
      });
    }

    text += `\n💳 <b>SỐ TIỀN CẦN THANH TOÁN:</b> <code>${finalAmount.toLocaleString('vi-VN')}đ</code>\n\n`;
    text += `👉 <i>Bấm các nút ❌ để bỏ bớt truyện hoặc bấm "TIẾN HÀNH THANH TOÁN" để nhận mã VietQR MB Bank (thời hạn 15 phút).</i>`;

    const keyboard = getCartKeyboard(cartItems);

    const options = {
      parse_mode: 'HTML',
      reply_markup: keyboard
    };

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options
      }).catch(async () => {
        await bot.sendMessage(chatId, text, options);
      });
    } else {
      await bot.sendMessage(chatId, text, options);
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
  await handleBookDetail(bot, chatId, bookId, fromPage, callbackQuery.message.message_id);
}

/**
 * Xóa truyện khỏi giỏ từ màn hình chi tiết truyện
 */
async function handleRemoveFromCart(bot, callbackQuery, bookId, fromPage = 1) {
  const chatId = callbackQuery.message.chat.id;
  await removeFromCart(chatId, bookId);
  await bot.answerCallbackQuery(callbackQuery.id, { text: '🗑️ Đã xóa khỏi giỏ hàng!' }).catch(() => {});
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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  handleViewCart,
  handleAddToCart,
  handleRemoveFromCart,
  handleDropFromCart,
  handleClearCart
};
