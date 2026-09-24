const { isUserVIP } = require('../database/vipRepo');
const { getCartCount } = require('../database/cartRepo');
const { getActiveEvent } = require('../database/eventsRepo');
const { upsertUser } = require('../database/usersRepo');
const { ADMIN_TELEGRAM_IDS, SUPPORT_USERNAME, GUIDE_LINK } = require('../config/env');
const { getMainMenuKeyboard } = require('../keyboards/mainKeyboards');

/**
 * Xử lý lệnh /start hoặc quay lại màn hình Menu chính
 */
async function handleStart(bot, msg, isEdit = false) {
  const chatId = msg.chat ? msg.chat.id : msg.message.chat.id;
  const from = msg.from;
  const username = from.username ? `@${from.username}` : from.first_name || 'Bạn';

  // Cập nhật thông tin User vào bảng users
  await upsertUser(chatId, from.username, from.first_name);

  // Lấy thông tin trạng thái tài khoản
  const isVIP = await isUserVIP(chatId);
  const cartCount = await getCartCount(chatId);
  const isAdmin = ADMIN_TELEGRAM_IDS.includes(chatId.toString());

  // Lấy thông tin sự kiện giảm giá đang kích hoạt (nếu có)
  const activeEvent = await getActiveEvent();

  let text = `🐸 **CHÀO MỪNG BẠN ĐẾN VỚI TRUYỆN ẾCH XANH**\n\n`;
  text += `👤 **Tài khoản:** ${username} (\`${chatId}\`)\n`;

  if (isVIP) {
    text += `🎟️ **Hội viên:** 💎 **VIP MEMBER** (Đang hoạt động)\n`;
    text += `✨ *Đặc quyền: Giảm 50% cho tất cả các đơn mua truyện!*\n\n`;
  } else {
    text += `🎟️ **Hội viên:** Thành viên thường\n`;
    text += `💎 *Nâng cấp VIP Member chỉ 139.000đ để được giảm 50% trọn đời!*\n\n`;
  }

  // Hiển thị Banner khuyến mại sự kiện nếu có
  if (activeEvent && activeEvent.content) {
    text += `🎉 **SỰ KIỆN ĐẶC BIỆT ĐANG DIỄN RA:**\n`;
    text += `${activeEvent.content}\n`;
    text += `💥 *Giảm thêm ${activeEvent.percent}% cho mọi đơn hàng!*\n\n`;
  }

  text += `🎁 **Chính sách ưu đãi mua nhiều:**\n`;
  text += `• Giỏ hàng từ 50.000đ → Giảm 5%, mỗi 10k tiếp theo giảm thêm +1% (tối đa 39%)\n`;
  text += `• Tổng ưu đãi có thể cộng dồn tối đa lên tới 75%!\n\n`;
  text += `👉 *Vui lòng chọn tính năng bên dưới để bắt đầu:*`;

  const keyboard = getMainMenuKeyboard(cartCount, isVIP, isAdmin);

  if (isEdit && msg.message) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msg.message.message_id,
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
}

/**
 * Hiển thị thông tin tài khoản cá nhân
 */
async function handleUserAccount(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const from = callbackQuery.from;
  const username = from.username ? `@${from.username}` : from.first_name || 'Không có';
  const isVIP = await isUserVIP(chatId);
  const cartCount = await getCartCount(chatId);

  let text = `👤 **THÔNG TIN TÀI KHOẢN**\n\n`;
  text += `• **Họ tên:** ${from.first_name || ''} ${from.last_name || ''}\n`;
  text += `• **Username:** ${username}\n`;
  text += `• **Telegram ID:** \`${chatId}\`\n`;
  text += `• **Hạng thành viên:** ${isVIP ? '💎 VIP Member (Giảm 50%)' : 'Thành viên thường'}\n`;
  text += `• **Truyện trong giỏ:** ${cartCount} cuốn\n\n`;
  text += `💡 *Tài khoản của bạn được liên kết trực tiếp với Telegram ID này. Mọi truyện bạn mua đều được lưu vĩnh viễn trong mục "Tủ truyện của tôi".*`;

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📖 Tủ Truyện Của Tôi", callback_data: "my_books:1" }],
        [{ text: "🏠 Menu Chính", callback_data: "nav_main" }]
      ]
    }
  }).catch(() => {});
}

/**
 * Hiển thị hướng dẫn & hỗ trợ
 */
async function handleSupportInfo(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;

  let text = `💬 **HƯỚNG DẪN & HỖ TRỢ**\n\n`;
  text += `📖 **Hướng dẫn đọc truyện trên điện thoại:**\n${GUIDE_LINK}\n\n`;
  text += `⚡ **Cách thức mua truyện:**\n`;
  text += `1. Bấm **"Xem Danh Sách Truyện"** để chọn truyện yêu thích.\n`;
  text += `2. Bấm vào truyện và chọn **"Thêm Vào Giỏ Hàng"**.\n`;
  text += `3. Mở **"Giỏ Hàng"** kiểm tra chiết khấu và bấm **"Thanh Toán"**.\n`;
  text += `4. Quét mã QR chuyển khoản MB Bank trong vòng 15 phút. Bot sẽ tự động gửi link truyện ngay khi nhận tiền!\n\n`;
  text += `📞 **Cần hỗ trợ gấp?**\nLiên hệ Admin: ${SUPPORT_USERNAME}`;

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 Menu Chính", callback_data: "nav_main" }]
      ]
    }
  }).catch(() => {});
}

module.exports = {
  handleStart,
  handleUserAccount,
  handleSupportInfo
};
