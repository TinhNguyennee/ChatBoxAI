const { getCart, clearCart } = require('../database/cartRepo');
const { isUserVIP } = require('../database/vipRepo');
const { createOrder, getOrderById, deleteOrder } = require('../database/ordersRepo');
const { addPurchases } = require('../database/purchasesRepo');
const { incrementSoldQuantity } = require('../database/booksRepo');
const { calculateCartPrice, calculateVIPPrice, generateOrderId } = require('../services/pricingService');
const { sendQRCode } = require('../services/qrService');
const { scheduleOrderExpiration, cancelExpirationTimer } = require('../services/orderExpirationService');
const { sendBookLinks } = require('../services/deliveryService');
const { getOrderPendingKeyboard } = require('../keyboards/cartKeyboards');
const { BANK_ACCOUNT_NO, BANK_NAME, SUPPORT_USERNAME } = require('../config/env');
const { ORDER_TYPE, ORDER_STATUS, ORDER_EXPIRATION_MINUTES } = require('../config/constants');

/**
 * Bắt đầu thanh toán giỏ hàng
 */
async function handleCheckoutCart(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const from = callbackQuery.from;
  const username = from.username ? `@${from.username}` : from.first_name || 'Khách';

  try {
    const cartItems = await getCart(chatId);
    if (cartItems.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Giỏ hàng của bạn đang trống!',
        show_alert: true
      }).catch(() => {});
    }

    const isVIP = await isUserVIP(chatId);

    // Trường hợp tất cả truyện trong giỏ đều miễn phí (Free)
    if (cartItems.every(b => b.free)) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '🎉 Các truyện đều miễn phí!' }).catch(() => {});
      await bot.sendMessage(
        chatId,
        `🎉 **TẤT CẢ TRUYỆN BẠN CHỌN ĐỀU MIỄN PHÍ!**\nLink đọc truyện đang được gửi đến bạn ngay dưới đây!`
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

    // 3. Soạn nội dung hóa đơn
    let caption = `🧾 **ĐƠN HÀNG MUA TRUYỆN: \`${orderId}\`**\n\n`;
    caption += `📚 Số lượng: ${cartItems.length} cuốn\n`;
    caption += `💰 Tiền gốc: ${totalOriginal.toLocaleString('vi-VN')}đ\n`;
    if (discountBreakdown.length > 0) {
      discountBreakdown.forEach(line => {
        caption += `${line}\n`;
      });
    }
    caption += `💳 **SỐ TIỀN CẦN CHUYỂN:** \`${finalAmount.toLocaleString('vi-VN')}đ\`\n\n`;

    caption += `⏰ **LƯU Ý THỜI HẠN 15 PHÚT:**\n`;
    caption += `• Đơn hàng có hiệu lực trong **15 phút** (hết hạn lúc **${expireTimeStr}**).\n`;
    caption += `• ⛔ **Sau 15 phút đơn sẽ tự động bị hủy, vui lòng KHÔNG chuyển khoản sau thời gian này!**\n\n`;

    caption += `🏦 **THÔNG TIN CHUYỂN KHOẢN:**\n`;
    caption += `• Ngân hàng: **${BANK_NAME}**\n`;
    caption += `• Số tài khoản: \`${BANK_ACCOUNT_NO}\`\n`;
    caption += `• Số tiền: \`${finalAmount.toLocaleString('vi-VN')}đ\`\n`;
    caption += `• Nội dung chuyển khoản: \`${orderId}\` *(BẮT BUỘC ĐÚNG MÃ ĐƠN)*\n\n`;
    caption += `✨ Bot sẽ tự động kiểm tra và gửi link truyện ngay sau khi tiền vào!`;

    const keyboard = getOrderPendingKeyboard(orderId);

    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    await sendQRCode(bot, chatId, finalAmount, orderId, caption, keyboard);

    console.log(`📋 ĐÃ TẠO ĐƠN TRUYỆN [${orderId}] | User: ${username} | ChatID: ${chatId} | Tiền: ${finalAmount}đ`);
  } catch (err) {
    console.error('❌ Lỗi handleCheckoutCart:', err.message);
    await bot.sendMessage(chatId, `❌ Đã có lỗi xảy ra khi tạo đơn hàng. Vui lòng thử lại hoặc nhắn tin cho ${SUPPORT_USERNAME}.`);
  }
}

/**
 * Xử lý tạo đơn mua VIP Member
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

    const { originalPrice, finalPrice, eventPercent, discountLines } = await calculateVIPPrice();
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

    let caption = `💎 **MUA GÓI VIP MEMBER VĨNH VIỄN**\n\n`;
    caption += `🎁 **Đặc quyền:** Giảm 50% trọn đời cho tất cả các đơn mua truyện sau này!\n`;
    caption += `💰 Giá gốc: ${originalPrice.toLocaleString('vi-VN')}đ\n`;
    if (discountLines.length > 0) {
      discountLines.forEach(line => caption += `${line}\n`);
    }
    caption += `💳 **SỐ TIỀN CẦN CHUYỂN:** \`${finalPrice.toLocaleString('vi-VN')}đ\`\n\n`;

    caption += `⏰ **LƯU Ý THỜI HẠN 15 PHÚT:**\n`;
    caption += `• Đơn hàng có hiệu lực trong **15 phút** (hết hạn lúc **${expireTimeStr}**).\n`;
    caption += `• ⛔ **Sau 15 phút đơn sẽ tự động bị hủy, vui lòng KHÔNG chuyển khoản sau thời gian này!**\n\n`;

    caption += `🏦 **THÔNG TIN CHUYỂN KHOẢN:**\n`;
    caption += `• Ngân hàng: **${BANK_NAME}**\n`;
    caption += `• Số tài khoản: \`${BANK_ACCOUNT_NO}\`\n`;
    caption += `• Số tiền: \`${finalPrice.toLocaleString('vi-VN')}đ\`\n`;
    caption += `• Nội dung chuyển khoản: \`${orderId}\` *(BẮT BUỘC ĐÚNG MÃ ĐƠN)*\n\n`;
    caption += `✨ Bot sẽ tự động kích hoạt VIP ngay khi nhận tiền!`;

    const keyboard = getOrderPendingKeyboard(orderId);

    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    await sendQRCode(bot, chatId, finalPrice, orderId, caption, keyboard);

    console.log(`📋 ĐÃ TẠO ĐƠN VIP [${orderId}] | User: ${username} | ChatID: ${chatId} | Tiền: ${finalPrice}đ`);
  } catch (err) {
    console.error('❌ Lỗi handleBuyVIP:', err.message);
    await bot.sendMessage(chatId, `❌ Đã có lỗi xảy ra khi tạo đơn VIP. Vui lòng liên hệ ${SUPPORT_USERNAME}.`);
  }
}

/**
 * Kiểm tra trạng thái đơn hàng khi người dùng bấm nút tra cứu
 */
async function handleCheckOrder(bot, callbackQuery, orderId) {
  const chatId = callbackQuery.message.chat.id;
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Đơn hàng này không tồn tại hoặc đã bị hủy do quá 15 phút.',
        show_alert: true
      }).catch(() => {});
    }

    if (order.status === ORDER_STATUS.PAID) {
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
    await deleteOrder(orderId);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '🗑️ Đã hủy đơn hàng thành công!' }).catch(() => {});
    await bot.sendMessage(chatId, `✅ Đơn hàng \`${orderId}\` đã được hủy.`);
  } catch (err) {
    console.error('❌ Lỗi handleCancelOrder:', err.message);
  }
}

module.exports = {
  handleCheckoutCart,
  handleBuyVIP,
  handleCheckOrder,
  handleCancelOrder
};
