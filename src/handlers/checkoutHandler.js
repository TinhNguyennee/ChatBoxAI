const { getCart, clearCart } = require('../database/cartRepo');
const { isUserVIP } = require('../database/vipRepo');
const { createOrder, getOrderById, deleteOrder } = require('../database/ordersRepo');
const { addPurchases } = require('../database/purchasesRepo');
const { incrementSoldQuantity } = require('../database/booksRepo');
const { calculateCartPrice, calculateVIPPrice, generateOrderId } = require('../services/pricingService');
const { sendQRCode } = require('../services/qrService');
const { scheduleOrderExpiration, cancelExpirationTimer } = require('../services/orderExpirationService');
const { isOrderExpiredInCache, markOrderAsExpiredInCache } = require('../database/cache');
const { sendBookLinks } = require('../services/deliveryService');
const { getOrderPendingKeyboard } = require('../keyboards/cartKeyboards');
const { BANK_ACCOUNT_NO, BANK_NAME, SUPPORT_USERNAME } = require('../config/env');
const { ORDER_TYPE, ORDER_STATUS, ORDER_EXPIRATION_MINUTES } = require('../config/constants');

/**
 * Bắt đầu thanh toán giỏ hàng (Liệt kê rõ từng truyện trong hóa đơn, format HTML chuẩn đẹp)
 */
async function handleCheckoutCart(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const from = callbackQuery.from;
  const username = from.username ? `@${from.username}` : from.first_name || 'Khách';

  try {
    const [cartItems, isVIP] = await Promise.all([
      getCart(chatId),
      isUserVIP(chatId)
    ]);

    if (cartItems.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Giỏ hàng của bạn đang trống!',
        show_alert: true
      }).catch(() => {});
    }

    // Trường hợp tất cả truyện trong giỏ đều miễn phí (Free)
    if (cartItems.every(b => b.free)) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '🎉 Các truyện đều miễn phí!' }).catch(() => {});
      await bot.sendMessage(
        chatId,
        `🎉 <b>TẤT CẢ TRUYỆN BẠN CHỌN ĐỀU MIỄN PHÍ!</b>\nLink đọc truyện đang được gửi đến bạn ngay dưới đây!`,
        { parse_mode: 'HTML' }
      );
      const bookIds = cartItems.map(b => b.id);
      await addPurchases(chatId, bookIds, 'FREE_ORDER');
      await incrementSoldQuantity(bookIds);
      await clearCart(chatId);
      await sendBookLinks(bot, chatId, cartItems, true);
      return;
    }

    const { totalOriginal, finalAmount, discountBreakdown } = await calculateCartPrice(cartItems, isVIP);
    const orderId = generateOrderId();

    // 1. Lưu đơn hàng vào Neon PostgreSQL với hạn 15 phút
    await createOrder({
      orderId,
      telegramId: chatId,
      username,
      orderType: ORDER_TYPE.BOOKS,
      items: cartItems.map(b => ({ id: b.id, name: b.name, price: b.price })),
      originalAmount: totalOriginal,
      finalAmount,
      discountLines: discountBreakdown
    });

    // 2. Kích hoạt đếm ngược 15 phút để tự động hủy & xóa khỏi DB
    scheduleOrderExpiration(bot, orderId, chatId, ORDER_EXPIRATION_MINUTES * 60 * 1000);

    // Tính thời gian hết hạn hiển thị (sau 15 phút)
    const expireTime = new Date(Date.now() + ORDER_EXPIRATION_MINUTES * 60 * 1000);
    const expireTimeStr = expireTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    // 3. Soạn nội dung hóa đơn LIỆT KÊ ĐẦY ĐỦ CÁC TRUYỆN TRONG ĐƠN
    let caption = `🧾 <b>ĐƠN HÀNG: <code>${orderId}</code></b>\n\n`;
    caption += `📚 <b>Danh sách truyện trong đơn (${cartItems.length} cuốn):</b>\n`;
    caption += `━━━━━━━━━━━━━━━━━━━━\n`;
    cartItems.forEach((b, idx) => {
      const priceStr = b.free ? "Free" : `${b.price.toLocaleString('vi-VN')}đ`;
      const shortName = b.name.length > 22 ? b.name.substring(0, 20) + '..' : b.name;
      caption += `${idx + 1}. #${b.id} <b>${escapeHtml(shortName)}</b> — <code>${priceStr}</code>\n`;
    });
    caption += `━━━━━━━━━━━━━━━━━━━━\n`;

    caption += `💰 <b>Tổng tiền gốc:</b> ${totalOriginal.toLocaleString('vi-VN')}đ\n`;
    if (discountBreakdown.length > 0) {
      discountBreakdown.forEach(line => {
        caption += `• ${escapeHtml(line)}\n`;
      });
    }
    caption += `💳 <b>SỐ TIỀN CẦN CHUYỂN:</b> <code>${finalAmount.toLocaleString('vi-VN')}đ</code>\n\n`;

    caption += `⏰ <b>LƯU Ý THỜI HẠN 15 PHÚT:</b>\n`;
    caption += `• Đơn hàng có hiệu lực trong <b>15 phút</b> (hết hạn lúc <b>${expireTimeStr}</b>).\n`;
    caption += `• ⛔ <b>Sau 15 phút đơn sẽ tự động bị hủy, vui lòng KHÔNG chuyển khoản sau thời gian này!</b>\n\n`;

    caption += `🏦 <b>THÔNG TIN CHUYỂN KHOẢN:</b>\n`;
    caption += `• Ngân hàng: <b>${BANK_NAME}</b>\n`;
    caption += `• Số tài khoản: <code>${BANK_ACCOUNT_NO}</code>\n`;
    caption += `• Số tiền: <code>${finalAmount.toLocaleString('vi-VN')}đ</code>\n`;
    caption += `• Nội dung chuyển khoản: <code>${orderId}</code> <i>(BẮT BUỘC ĐÚNG MÃ ĐƠN)</i>\n\n`;
    caption += `✨ Bot sẽ tự động kiểm tra và gửi link truyện ngay sau khi nhận được tiền!`;

    const keyboard = getOrderPendingKeyboard(orderId);

    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    await sendQRCode(bot, chatId, finalAmount, orderId, caption, keyboard, 'HTML');

    console.log(`📋 ĐÃ TẠO ĐƠN TRUYỆN [${orderId}] | User: ${username} | ChatID: ${chatId} | Tiền: ${finalAmount}đ`);
  } catch (err) {
    console.error('❌ Lỗi handleCheckoutCart:', err.message);
    await bot.sendMessage(chatId, `❌ Đã có lỗi xảy ra khi tạo đơn hàng. Vui lòng thử lại hoặc nhắn tin cho ${SUPPORT_USERNAME}.`);
  }
}

/**
 * Xử lý tạo đơn mua VIP Member (Đã sửa giá VIP chuẩn xác)
 */
async function handleBuyVIP(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const from = callbackQuery.from;
  const username = from.username ? `@${from.username}` : from.first_name || 'Khách';

  try {
    const alreadyVIP = await isUserVIP(chatId);
    if (alreadyVIP) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '💎 Bạn đã là VIP Member rồi! Không cần mua lại nhé.',
        show_alert: true
      }).catch(() => {});
    }

    const { originalPrice, finalPrice, discountLines } = await calculateVIPPrice();
    const orderId = generateOrderId();

    // 1. Lưu đơn VIP vào Neon DB với hạn 15 phút
    await createOrder({
      orderId,
      telegramId: chatId,
      username,
      orderType: ORDER_TYPE.VIP,
      items: [{ id: 'VIP', name: 'Gói VIP Member Vĩnh Viễn', price: originalPrice }],
      originalAmount: originalPrice,
      finalAmount: finalPrice,
      discountLines
    });

    // 2. Kích hoạt đếm ngược 15 phút
    scheduleOrderExpiration(bot, orderId, chatId, ORDER_EXPIRATION_MINUTES * 60 * 1000);

    const expireTime = new Date(Date.now() + ORDER_EXPIRATION_MINUTES * 60 * 1000);
    const expireTimeStr = expireTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    let caption = `💎 <b>MUA GÓI VIP MEMBER VĨNH VIỄN</b>\n\n`;
    caption += `🎁 <b>Đặc quyền:</b> Giảm 50% trọn đời cho tất cả các đơn mua truyện sau này!\n`;
    caption += `💰 Giá gốc: ${originalPrice.toLocaleString('vi-VN')}đ\n`;
    if (discountLines.length > 0) {
      discountLines.forEach(line => caption += `${escapeHtml(line)}\n`);
    }
    caption += `💳 <b>SỐ TIỀN CẦN CHUYỂN:</b> <code>${finalPrice.toLocaleString('vi-VN')}đ</code>\n\n`;

    caption += `⏰ <b>LƯU Ý THỜI HẠN 15 PHÚT:</b>\n`;
    caption += `• Đơn hàng có hiệu lực trong <b>15 phút</b> (hết hạn lúc <b>${expireTimeStr}</b>).\n`;
    caption += `• ⛔ <b>Sau 15 phút đơn sẽ tự động bị hủy, vui lòng KHÔNG chuyển khoản sau thời gian này!</b>\n\n`;

    caption += `🏦 <b>THÔNG TIN CHUYỂN KHOẢN:</b>\n`;
    caption += `• Ngân hàng: <b>${BANK_NAME}</b>\n`;
    caption += `• Số tài khoản: <code>${BANK_ACCOUNT_NO}</code>\n`;
    caption += `• Số tiền: <code>${finalPrice.toLocaleString('vi-VN')}đ</code>\n`;
    caption += `• Nội dung chuyển khoản: <code>${orderId}</code> <i>(BẮT BUỘC ĐÚNG MÃ ĐƠN)</i>\n\n`;
    caption += `✨ Bot sẽ tự động kích hoạt VIP ngay khi nhận tiền!`;

    const keyboard = getOrderPendingKeyboard(orderId);

    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    await sendQRCode(bot, chatId, finalPrice, orderId, caption, keyboard, 'HTML');

    console.log(`📋 ĐÃ TẠO ĐƠN VIP [${orderId}] | User: ${username} | ChatID: ${chatId} | Tiền: ${finalPrice}đ`);
  } catch (err) {
    console.error('❌ Lỗi handleBuyVIP:', err.message);
    await bot.sendMessage(chatId, `❌ Đã có lỗi xảy ra khi tạo đơn VIP. Vui lòng liên hệ ${SUPPORT_USERNAME}.`);
  }
}

/**
 * Kiểm tra trạng thái đơn hàng khi người dùng bấm nút tra cứu (Tối ưu siêu tốc 0ms với Cache)
 */
async function handleCheckOrder(bot, callbackQuery, orderId) {
  try {
    // 1. Kiểm tra nhanh trong Cache đơn hết hạn (0ms)
    if (isOrderExpiredInCache(orderId)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Đơn hàng này đã hết hạn sau 15 phút và đã bị hủy tự động.',
        show_alert: true
      }).catch(() => {});
    }

    // 2. Tra cứu DB
    const order = await getOrderById(orderId);
    if (!order) {
      markOrderAsExpiredInCache(orderId);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Đơn hàng này không tồn tại hoặc đã bị hủy do quá 15 phút.',
        show_alert: true
      }).catch(() => {});
    }

    if (order.status === ORDER_STATUS.PAID || order.status === 'completed') {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ Đơn hàng đã được thanh toán thành công!',
        show_alert: true
      }).catch(() => {});
    }

    const remainingMinutes = Math.max(0, Math.ceil((new Date(order.expires_at) - Date.now()) / (60 * 1000)));

    return bot.answerCallbackQuery(callbackQuery.id, {
      text: `⏳ Đang chờ thanh toán... Đơn còn hiệu lực khoảng ${remainingMinutes} phút.`,
      show_alert: true
    }).catch(() => {});
  } catch (err) {
    console.error('❌ Lỗi handleCheckOrder:', err.message);
  }
}

/**
 * Hủy đơn hàng thủ công
 */
async function handleCancelOrder(bot, callbackQuery, orderId) {
  const chatId = callbackQuery.message.chat.id;
  try {
    cancelExpirationTimer(orderId);
    markOrderAsExpiredInCache(orderId);
    await deleteOrder(orderId);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '🗑️ Đã hủy đơn hàng thành công!' }).catch(() => {});
    await bot.sendMessage(chatId, `✅ Đơn hàng <code>${orderId}</code> đã được hủy.`, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('❌ Lỗi handleCancelOrder:', err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  handleCheckoutCart,
  handleBuyVIP,
  handleCheckOrder,
  handleCancelOrder
};
