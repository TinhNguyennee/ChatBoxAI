const { isUserVIP } = require('../database/vipRepo');
const { getCartCount } = require('../database/cartRepo');
const { getActiveEvent } = require('../database/eventsRepo');
const { upsertUser } = require('../database/usersRepo');
const { ADMIN_TELEGRAM_IDS, SUPPORT_USERNAME, GUIDE_LINK } = require('../config/env');
const { getMainMenuKeyboard } = require('../keyboards/mainKeyboards');

/**
 * Xử lý lệnh /start hoặc quay lại màn hình Menu chính (Siêu tốc với RAM Cache + Song song)
 */
async function handleStart(bot, msg, isEdit = false) {
  const chatId = msg.chat ? msg.chat.id : msg.message.chat.id;
  const from = msg.from;
  const username = from.username ? `@${from.username}` : from.first_name || 'Bạn';

  // Chạy song song upsertUser và getCartCount để giảm thời gian chờ
  const [_, cartCount, isVIP, activeEvent] = await Promise.all([
    upsertUser(chatId, from.username, from.first_name),
    getCartCount(chatId),
    isUserVIP(chatId),
    getActiveEvent()
  ]);

  const isAdmin = ADMIN_TELEGRAM_IDS.includes(chatId.toString());

  let text = `🐸 <b>CHÀO MỪNG BẠN ĐẾN VỚI TRUYỆN ẾCH XANH</b>\n\n`;
  text += `👤 <b>Tài khoản:</b> ${escapeHtml(username)} (<code>${chatId}</code>)\n`;

  if (isVIP) {
    text += `🎟️ <b>Hội viên:</b> 💎 <b>VIP MEMBER</b> (Đang hoạt động)\n`;
    text += `✨ <i>Đặc quyền: Giảm 50% cho tất cả các đơn mua truyện!</i>\n\n`;
  } else {
    text += `🎟️ <b>Hội viên:</b> Thành viên thường\n`;
    text += `💎 <i>Nâng cấp VIP Member chỉ 139.000đ để được giảm 50% trọn đời!</i>\n\n`;
  }

  // Hiển thị Banner khuyến mại sự kiện nếu có
  if (activeEvent && activeEvent.content) {
    text += `🎉 <b>SỰ KIỆN ĐẶC BIỆT ĐANG DIỄN RA:</b>\n`;
    text += `🔥 <i>${escapeHtml(activeEvent.content)}</i>\n`;
    text += `💥 <b>Giảm thêm ${activeEvent.percent}% cho mọi đơn hàng!</b>\n\n`;
  }

  text += `🎁 <b>Chính sách ưu đãi mua nhiều:</b>\n`;
  text += `• Giỏ hàng từ 50.000đ → Giảm 5%, mỗi 10k tiếp theo giảm thêm +1% (tối đa 39%)\n`;
  text += `• Tổng ưu đãi có thể cộng dồn tối đa lên tới 75%!\n\n`;
  text += `👉 <i>Vui lòng chọn tính năng bên dưới để bắt đầu:</i>`;

  const keyboard = getMainMenuKeyboard(cartCount, isVIP, isAdmin);

  const options = {
    parse_mode: 'HTML',
    reply_markup: keyboard
  };

  if (isEdit && msg.message) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msg.message.message_id,
      ...options
    }).catch(async () => {
      await bot.sendMessage(chatId, text, options);
    });
  } else {
    await bot.sendMessage(chatId, text, options);
  }
}

/**
 * Hiển thị thông tin tài khoản cá nhân
 */
async function handleUserAccount(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const from = callbackQuery.from;
  const username = from.username ? `@${from.username}` : from.first_name || 'Không có';

  const [isVIP, cartCount] = await Promise.all([
    isUserVIP(chatId),
    getCartCount(chatId)
  ]);

  let text = `👤 <b>THÔNG TIN TÀI KHOẢN</b>\n\n`;
  text += `• <b>Họ tên:</b> ${escapeHtml(from.first_name || '')} ${escapeHtml(from.last_name || '')}\n`;
  text += `• <b>Username:</b> ${escapeHtml(username)}\n`;
  text += `• <b>Telegram ID:</b> <code>${chatId}</code>\n`;
  text += `• <b>Hạng thành viên:</b> ${isVIP ? '💎 VIP Member (Giảm 50%)' : 'Thành viên thường'}\n`;
  text += `• <b>Truyện trong giỏ:</b> ${cartCount} cuốn\n\n`;
  text += `💡 <i>Tài khoản của bạn được liên kết trực tiếp với Telegram ID này. Mọi truyện bạn mua đều được lưu vĩnh viễn trong mục "Tủ truyện của tôi".</i>`;

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📖 Tủ Truyện Của Tôi", callback_data: "my_books:1" }],
        [{ text: "🏠 Menu Chính", callback_data: "nav_main" }]
      ]
    }
  }).catch(() => {});
}

/**
 * Hiển thị hướng dẫn & hỗ trợ (Sửa lỗi parse Markdown, giao diện trực quan 100%)
 */
async function handleSupportInfo(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;

  const adminUsername = SUPPORT_USERNAME.replace('@', '');

  let text = `💬 <b>HƯỚNG DẪN SỬ DỤNG & HỖ TRỢ</b>\n\n`;
  text += `⚡ <b>4 BƯỚC ĐỌC VÀ MUA TRUYỆN DỄ DÀNG:</b>\n`;
  text += `1️⃣ Bấm <b>"Xem Danh Sách Truyện"</b> để duyệt kho truyện cực phong phú.\n`;
  text += `2️⃣ Bấm vào truyện để xem tóm tắt nội dung và chọn <b>"Thêm Vào Giỏ Hàng"</b>.\n`;
  text += `   <i>(Nếu là truyện Free, bạn bấm "Đọc Ngay" là có link đọc liền!)</i>\n`;
  text += `3️⃣ Mở <b>"Giỏ Hàng"</b> kiểm tra bảng giảm giá và bấm <b>"Thanh Toán"</b>.\n`;
  text += `4️⃣ Quét mã QR chuyển khoản MB Bank trong <b>15 phút</b>. Bot tự động kích hoạt và gửi link đọc ngay lập tức!\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📖 <b>Tủ truyện của tôi:</b> Toàn bộ truyện bạn đã mua sẽ nằm ở đây, không bao giờ lo mất link.\n`;
  text += `💎 <b>Gói VIP Member:</b> Chỉ 139k để được giảm 50% trọn đời.\n\n`;
  text += `📞 <b>Cần hỗ trợ kỹ thuật hoặc nạp tiền?</b> Bấm nút liên hệ Admin bên dưới nhé!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "📖 Hướng Dẫn Đọc Trên Điện Thoại", url: GUIDE_LINK }],
      [{ text: "💬 Nhắn Tin Trực Tiếp Với Admin", url: `https://t.me/${adminUsername}` }],
      [
        { text: "📚 Khám Phá Kho Truyện", callback_data: "nav_list:1" },
        { text: "🏠 Về Menu Chính", callback_data: "nav_main" }
      ]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard
  }).catch(async (err) => {
    console.error('Lỗi editMessageText handleSupportInfo:', err.message);
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard
    }).catch(() => {});
  });
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
  handleStart,
  handleUserAccount,
  handleSupportInfo
};
