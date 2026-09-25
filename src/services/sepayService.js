const { SEPAY_API_KEY, SUPPORT_USERNAME } = require('../config/env');
const { ORDER_TYPE } = require('../config/constants');
const { findPendingOrderByContent, markOrderAsPaid } = require('../database/ordersRepo');
const { addToVIP } = require('../database/vipRepo');
const { incrementSoldQuantity, getBookById } = require('../database/booksRepo');
const { addPurchases } = require('../database/purchasesRepo');
const { removeFromCart } = require('../database/cartRepo');
const { cancelExpirationTimer } = require('./orderExpirationService');
const { sendBookLinks } = require('./deliveryService');

/**
 * Xử lý webhook từ SePay khi có biến động số dư chuyển khoản
 */
async function processSepayWebhook(bot, reqBody, authHeader) {
  // 1. Kiểm tra xác thực SePay API Key (nếu có cấu hình)
  if (SEPAY_API_KEY) {
    const expectedHeader = `Apikey ${SEPAY_API_KEY}`;
    if (authHeader !== expectedHeader && authHeader !== SEPAY_API_KEY) {
      console.warn('⚠️ Cảnh báo: Webhook SePay bị từ chối do API Key không khớp!');
      return { status: 401, message: 'Unauthorized' };
    }
  }

  const content = (reqBody.content || reqBody.description || '').trim();
  const amount = parseInt(reqBody.transferAmount || reqBody.amount, 10) || 0;

  if (!content) {
    return { status: 200, message: 'Ignored: No content' };
  }

  // 2. Tìm đơn hàng PENDING trong PostgreSQL
  const order = await findPendingOrderByContent(content);
  if (!order) {
    console.log(`ℹ️ Webhook SePay: Không tìm thấy đơn PENDING cho nội dung: "${content}"`);
    return { status: 200, message: 'Order not found or already processed' };
  }

  // 3. Kiểm tra số tiền chuyển khoản (phải >= số tiền cần thanh toán)
  if (amount < order.final_amount) {
    console.warn(`⚠️ Số tiền chuyển (${amount}đ) ít hơn đơn hàng (${order.final_amount}đ) cho đơn [${order.order_id}]`);
    return { status: 200, message: 'Underpaid' };
  }

  const orderId = order.order_id;
  const chatId = order.telegram_id;
  const transId = reqBody.id || reqBody.referenceCode || null;

  // 4. Đánh dấu đơn là PAID trong DB
  const updatedOrder = await markOrderAsPaid(orderId, transId);
  if (!updatedOrder) {
    return { status: 200, message: 'Already marked as paid' };
  }

  // 5. Hủy đếm ngược 15 phút
  cancelExpirationTimer(orderId);

  console.log(`✅ THANH TOÁN THÀNH CÔNG | Đơn: ${orderId} | ChatID: ${chatId} | Số tiền: ${amount.toLocaleString('vi-VN')}đ`);

  try {
    if (order.order_type === ORDER_TYPE.VIP) {
      // Cấp VIP
      await addToVIP(chatId);
      await bot.sendMessage(
        chatId,
        `🎉 <b>THANH TOÁN VIP THÀNH CÔNG!</b>\n\n` +
        `💎 Bạn đã chính thức trở thành <b>VIP Member vĩnh viễn</b>.\n` +
        `Từ nay mọi lần mua truyện bạn sẽ được <b>giảm 50%</b> tự động.\n\n` +
        `Cảm ơn bạn đã đồng hành cùng Truyện Ếch Xanh! 🔥`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: "📚 Khám Phá Kho Truyện (Giảm 50%)", callback_data: "nav_list:1" }],
              [{ text: "🏠 Về Menu Chính", callback_data: "nav_main" }]
            ]
          }
        }
      );
    } else {
      // Đơn mua truyện
      const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
      const bookIds = items.map(b => b.id);

      // Thêm vào Tủ truyện của người dùng
      await addPurchases(chatId, bookIds, orderId);

      // Tăng số lượng đã bán
      await incrementSoldQuantity(bookIds);

      // Xóa các truyện đã mua khỏi giỏ hàng
      for (const id of bookIds) {
        await removeFromCart(chatId, id);
      }

      // Lấy thông tin sách đầy đủ (có link Google Docs chuẩn) từ database/cache
      const fullBooks = await Promise.all(bookIds.map(id => getBookById(id)));
      const booksToDeliver = fullBooks.filter(Boolean);

      // Gửi link truyện tự động cho khách kèm các nút bấm mở đọc liền
      await sendBookLinks(bot, chatId, booksToDeliver.length > 0 ? booksToDeliver : items, false);
    }
  } catch (err) {
    console.error(`❌ Lỗi sau thanh toán đơn ${orderId}:`, err.message);
    if (chatId) {
      await bot.sendMessage(
        chatId,
        `✅ Thanh toán của bạn đã thành công, nhưng hệ thống gặp lỗi khi gửi truyện tự động.\n` +
        `Vui lòng nhắn tin cho ${SUPPORT_USERNAME} kèm mã đơn \`${orderId}\` để được hỗ trợ ngay lập tức!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  }

  return { status: 200, message: 'Payment processed successfully' };
}

module.exports = {
  processSepayWebhook
};
