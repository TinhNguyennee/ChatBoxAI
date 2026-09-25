const { ADMIN_TELEGRAM_IDS } = require('../config/env');
const { getRevenueStats } = require('../database/ordersRepo');
const { getUserCount, getAllUserIds } = require('../database/usersRepo');
const { getVIPCount, addToVIP, removeFromVIP } = require('../database/vipRepo');
const { getTopSellingBooks } = require('../database/booksRepo');
const { getActiveEvent, setEventStatus } = require('../database/eventsRepo');
const { getAdminDashboardKeyboard, getAdminBackKeyboard } = require('../keyboards/adminKeyboards');

/**
 * Kiểm tra xem một người dùng có phải là Admin hay không
 */
function checkIsAdmin(chatId) {
  if (!chatId) return false;
  const env = require('../config/env');
  const allowed = (env.ADMIN_TELEGRAM_IDS && env.ADMIN_TELEGRAM_IDS.length > 0)
    ? env.ADMIN_TELEGRAM_IDS
    : ['5638827352'];
  return allowed.includes(chatId.toString().trim());
}

/**
 * Bảng điều khiển chính của Admin
 */
async function handleAdminDashboard(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) {
    return bot.sendMessage(chatId, `⛔ Bạn không có quyền truy cập khu vực Quản trị viên.`);
  }

  const text = 
    `👑 <b>BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN (ADMIN)</b>\n\n` +
    `Chào mừng Admin! Bạn có thể xem thống kê kinh doanh, quản lý sự kiện khuyến mại hoặc gửi tin nhắn thông báo hàng loạt tại đây:`;

  const keyboard = getAdminDashboardKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(async () => {
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }
}

/**
 * Hiển thị báo cáo thống kê doanh thu (Top truyện đã lọc bỏ truyện Free)
 */
async function handleAdminStats(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  const [stats, totalUsers, vipCount, topBooks] = await Promise.all([
    getRevenueStats(),
    getUserCount(),
    getVIPCount(),
    getTopSellingBooks(5)
  ]);

  let text = `📊 <b>BÁO CÁO THỐNG KÊ DOANH THU &amp; HOẠT ĐỘNG</b>\n\n`;
  text += `💵 <b>Doanh thu hôm nay:</b> <code>${stats.todayRevenue.toLocaleString('vi-VN')}đ</code> (${stats.todayOrders} đơn)\n`;
  text += `📅 <b>Doanh thu tháng này:</b> <code>${stats.monthRevenue.toLocaleString('vi-VN')}đ</code> (${stats.monthOrders} đơn)\n`;
  text += `💰 <b>Tổng doanh thu tích lũy:</b> <code>${stats.totalRevenue.toLocaleString('vi-VN')}đ</code> (${stats.totalOrders} đơn)\n\n`;

  text += `👥 <b>Người dùng &amp; Hội viên:</b>\n`;
  text += `• Tổng người dùng đã tương tác: <b>${totalUsers}</b>\n`;
  text += `• Tổng số thành viên VIP: <b>${vipCount}</b>\n\n`;

  text += `🏆 <b>Top truyện bán chạy nhất (Chỉ tính truyện trả phí):</b>\n`;
  if (topBooks.length > 0) {
    topBooks.forEach((b, i) => {
      text += `${i + 1}. #${b.id} <b>${escapeHtml(b.name)}</b> — Đã bán: <b>${b.sold_quantity || 0}</b> lượt\n`;
    });
  } else {
    text += `<i>(Chưa có dữ liệu đơn mua trả phí)</i>\n`;
  }

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(async () => {
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

/**
 * Hiển thị và quản lý sự kiện khuyến mại
 */
async function handleAdminEvent(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  const event = await getActiveEvent();
  let text = `🏷 <b>QUẢN LÝ SỰ KIỆN KHUYẾN MÃI</b>\n\n`;

  if (event && event.active) {
    text += `🟢 <b>Trạng thái:</b> ĐANG HOẠT ĐỘNG\n`;
    text += `• Mức giảm: <b>${event.percent}%</b>\n`;
    text += `• Nội dung banner:\n<i>${escapeHtml(event.content)}</i>\n\n`;
  } else {
    text += `🔴 <b>Trạng thái:</b> ĐANG TẮT (Không có sự kiện)\n\n`;
  }

  text += `📝 <b>Hướng dẫn lệnh thao tác nhanh:</b>\n`;
  text += `• Bật/cập nhật sự kiện: Gõ <code>/setevent &lt;%&gt; &lt;nội dung&gt;</code>\n  <i>Ví dụ:</i> <code>/setevent 20 Chúc mừng ngày 8/3 - Giảm giá siêu sốc!</code>\n`;
  text += `• Tắt sự kiện: Gõ <code>/stopevent</code>`;

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(async () => {
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

/**
 * Hướng dẫn cấp VIP thủ công
 */
async function handleAdminVipPrompt(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  let text = `💎 <b>QUẢN LÝ THÀNH VIÊN VIP</b>\n\n`;
  text += `Bạn có thể cấp hoặc hủy quyền VIP của bất kỳ người dùng nào bằng lệnh sau:\n\n`;
  text += `• Cấp VIP cho user: Gõ <code>/addvip &lt;telegram_id&gt;</code>\n  <i>Ví dụ:</i> <code>/addvip 123456789</code>\n\n`;
  text += `• Thu hồi VIP của user: Gõ <code>/delvip &lt;telegram_id&gt;</code>\n  <i>Ví dụ:</i> <code>/delvip 123456789</code>`;

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(async () => {
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

/**
 * Hướng dẫn gửi tin nhắn broadcast (Đã sửa lỗi parse ký tự)
 */
async function handleAdminBroadcastPrompt(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  const userCount = await getUserCount();
  let text = `📢 <b>GỬI TIN NHẮN BROADCAST (HÀNG LOẠT)</b>\n\n`;
  text += `Hiện tại có <b>${userCount}</b> người dùng đã từng tương tác với bot.\n\n`;
  text += `Để gửi tin nhắn thông báo (ra mắt truyện mới, khuyến mãi) đến toàn bộ người dùng, bạn hãy gõ lệnh theo cú pháp sau:\n\n`;
  text += `<code>/broadcast &lt;Nội dung thông báo cần gửi&gt;</code>\n\n`;
  text += `<i>Ví dụ thực tế:</i>\n<code>/broadcast 🔥 Vừa cập nhật 5 bộ truyện mới cực hay, mời bạn vào mục Danh sách truyện để thưởng thức nhé!</code>`;

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(async () => {
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

/**
 * Xử lý lệnh text /setevent
 */
async function handleSetEventCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  if (!checkIsAdmin(chatId)) return;

  const input = match[1] ? match[1].trim() : '';
  const firstSpace = input.indexOf(' ');
  if (firstSpace === -1) {
    return bot.sendMessage(chatId, `⚠️ Cú pháp: <code>/setevent &lt;%&gt; &lt;nội dung&gt;</code>\nVí dụ: <code>/setevent 20 Sale mừng 8/3</code>`, { parse_mode: 'HTML' });
  }

  const percent = parseInt(input.substring(0, firstSpace), 10);
  const content = input.substring(firstSpace + 1).trim();

  if (isNaN(percent) || percent < 0 || percent > 75) {
    return bot.sendMessage(chatId, `⚠️ Phần trăm giảm giá phải từ 1 đến 75%.`);
  }

  await setEventStatus(true, percent, content);
  await bot.sendMessage(chatId, `✅ Đã kích hoạt sự kiện: Giảm <b>${percent}%</b>!\nNội dung: <i>${escapeHtml(content)}</i>`, { parse_mode: 'HTML' });
}

/**
 * Xử lý lệnh text /stopevent
 */
async function handleStopEventCommand(bot, msg) {
  const chatId = msg.chat.id;
  if (!checkIsAdmin(chatId)) return;

  await setEventStatus(false, 0, '');
  await bot.sendMessage(chatId, `✅ Đã tắt sự kiện khuyến mãi.`);
}

/**
 * Xử lý lệnh text /addvip
 */
async function handleAddVIPCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  if (!checkIsAdmin(chatId)) return;

  const targetId = match[1] ? match[1].trim() : '';
  if (!targetId) {
    return bot.sendMessage(chatId, `⚠️ Cú pháp: <code>/addvip &lt;telegram_id&gt;</code>`, { parse_mode: 'HTML' });
  }

  await addToVIP(targetId);
  await bot.sendMessage(chatId, `✅ Đã cấp VIP thành công cho Telegram ID: <code>${targetId}</code>`, { parse_mode: 'HTML' });
  await bot.sendMessage(targetId, `🎉 <b>CHÚC MỪNG!</b> Bạn đã được Admin cấp quyền <b>VIP Member</b> (Giảm 50% mọi đơn hàng)!`, { parse_mode: 'HTML' }).catch(() => {});
}

/**
 * Xử lý lệnh text /delvip
 */
async function handleDelVIPCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  if (!checkIsAdmin(chatId)) return;

  const targetId = match[1] ? match[1].trim() : '';
  if (!targetId) {
    return bot.sendMessage(chatId, `⚠️ Cú pháp: <code>/delvip &lt;telegram_id&gt;</code>`, { parse_mode: 'HTML' });
  }

  await removeFromVIP(targetId);
  await bot.sendMessage(chatId, `✅ Đã thu hồi VIP của Telegram ID: <code>${targetId}</code>`, { parse_mode: 'HTML' });
}

/**
 * Xử lý lệnh text /broadcast
 */
async function handleBroadcastCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  if (!checkIsAdmin(chatId)) return;

  const content = match[1] ? match[1].trim() : '';
  if (!content) {
    return bot.sendMessage(chatId, `⚠️ Cú pháp: <code>/broadcast &lt;nội dung&gt;</code>`, { parse_mode: 'HTML' });
  }

  const userIds = await getAllUserIds();
  await bot.sendMessage(chatId, `⏳ Đang bắt đầu gửi tin nhắn tới <b>${userIds.length}</b> người dùng...`, { parse_mode: 'HTML' });

  let sentCount = 0;
  for (const uid of userIds) {
    try {
      await bot.sendMessage(uid, content);
      sentCount++;
    } catch (e) {
      // Bỏ qua nếu user đã block bot
    }
    await new Promise(r => setTimeout(r, 60)); // độ trễ 60ms tránh flood limit
  }

  await bot.sendMessage(chatId, `✅ Đã gửi thành công tới <b>${sentCount}/${userIds.length}</b> người dùng!`, { parse_mode: 'HTML' });
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
  checkIsAdmin,
  handleAdminDashboard,
  handleAdminStats,
  handleAdminEvent,
  handleAdminVipPrompt,
  handleAdminBroadcastPrompt,
  handleSetEventCommand,
  handleStopEventCommand,
  handleAddVIPCommand,
  handleDelVIPCommand,
  handleBroadcastCommand
};
