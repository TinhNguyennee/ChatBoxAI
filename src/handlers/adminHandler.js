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
  return ADMIN_TELEGRAM_IDS.includes(chatId.toString());
}

/**
 * Bảng điều khiển chính của Admin
 */
async function handleAdminDashboard(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) {
    return bot.sendMessage(chatId, `⛔ Bạn không có quyền truy cập khu vực Quản trị viên.`);
  }

  const text = 
    `👑 **BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN (ADMIN)**\n\n` +
    `Chào mừng Admin! Bạn có thể xem thống kê kinh doanh, quản lý sự kiện khuyến mại hoặc gửi tin nhắn thông báo hàng loạt tại đây:`;

  const keyboard = getAdminDashboardKeyboard();

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
}

/**
 * Hiển thị báo cáo thống kê doanh thu
 */
async function handleAdminStats(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  const stats = await getRevenueStats();
  const totalUsers = await getUserCount();
  const vipCount = await getVIPCount();
  const topBooks = await getTopSellingBooks(5);

  let text = `📊 **BÁO CÁO THỐNG KÊ DOANH THU & HOẠT ĐỘNG**\n\n`;
  text += `💵 **Doanh thu hôm nay:** \`${stats.todayRevenue.toLocaleString('vi-VN')}đ\` (${stats.todayOrders} đơn)\n`;
  text += `📅 **Doanh thu tháng này:** \`${stats.monthRevenue.toLocaleString('vi-VN')}đ\` (${stats.monthOrders} đơn)\n`;
  text += `💰 **Tổng doanh thu tích lũy:** \`${stats.totalRevenue.toLocaleString('vi-VN')}đ\` (${stats.totalOrders} đơn)\n\n`;

  text += `👥 **Người dùng & Hội viên:**\n`;
  text += `• Tổng người dùng đã tương tác: **${totalUsers}**\n`;
  text += `• Tổng số thành viên VIP: **${vipCount}**\n\n`;

  text += `🏆 **Top 5 truyện bán chạy nhất:**\n`;
  if (topBooks.length > 0) {
    topBooks.forEach((b, i) => {
      text += `${i + 1}. #${b.id} *${b.name}* — Đã bán: **${b.sold_quantity || 0}** lượt\n`;
    });
  } else {
    text += `(Chưa có dữ liệu)\n`;
  }

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }).catch(() => {});
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

/**
 * Hiển thị và quản lý sự kiện khuyến mại
 */
async function handleAdminEvent(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  const event = await getActiveEvent();
  let text = `🏷 **QUẢN LÝ SỰ KIỆN KHUYẾN MÃI**\n\n`;

  if (event && event.active) {
    text += `🟢 **Trạng thái:** ĐANG HOẠT ĐỘNG\n`;
    text += `• Mức giảm: **${event.percent}%**\n`;
    text += `• Nội dung banner:\n_${event.content}_\n\n`;
  } else {
    text += `🔴 **Trạng thái:** ĐANG TẮT (Không có sự kiện)\n\n`;
  }

  text += `📝 **Hướng dẫn lệnh thao tác nhanh:**\n`;
  text += `• Bật/cập nhật sự kiện: Gõ \`/setevent <%> <nội dung>\`\n  _Ví dụ:_ \`/setevent 20 Chúc mừng ngày 8/3 - Giảm giá siêu sốc!\`\n`;
  text += `• Tắt sự kiện: Gõ \`/stopevent\``;

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }).catch(() => {});
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

/**
 * Hướng dẫn cấp VIP thủ công
 */
async function handleAdminVipPrompt(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  let text = `💎 **QUẢN LÝ THÀNH VIÊN VIP**\n\n`;
  text += `Bạn có thể cấp hoặc hủy quyền VIP của bất kỳ người dùng nào bằng lệnh sau:\n\n`;
  text += `• Cấp VIP cho user: Gõ \`/addvip <telegram_id>\`\n  _Ví dụ:_ \`/addvip 123456789\`\n\n`;
  text += `• Thu hồi VIP của user: Gõ \`/delvip <telegram_id>\`\n  _Ví dụ:_ \`/delvip 123456789\``;

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }).catch(() => {});
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

/**
 * Hướng dẫn gửi tin nhắn broadcast
 */
async function handleAdminBroadcastPrompt(bot, chatId, messageId = null) {
  if (!checkIsAdmin(chatId)) return;

  const userCount = await getUserCount();
  let text = `📢 **GỬI TIN NHẮN BROADCAST (HÀNG LOẠT)**\n\n`;
  text += `Hiện tại có **${userCount}** người dùng trong hệ thống.\n\n`;
  text += `Để gửi tin nhắn thông báo (truyện mới, khuyến mãi) đến toàn bộ người dùng, bạn hãy gõ lệnh:\n`;
  text += `\`/broadcast <Nội dung tin nhắn cần gửi>\`\n\n`;
  text += `_Ví dụ:_ \`/broadcast 🔥 Vừa cập nhật 5 bộ truyện mới cực hay, mời bạn bấm vào bot để đọc thử nhé!_`;

  const keyboard = getAdminBackKeyboard();

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }).catch(() => {});
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
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
    return bot.sendMessage(chatId, `⚠️ Cú pháp: \`/setevent <%> <nội dung>\`\nVí dụ: \`/setevent 20 Sale mừng 8/3\``, { parse_mode: 'Markdown' });
  }

  const percent = parseInt(input.substring(0, firstSpace), 10);
  const content = input.substring(firstSpace + 1).trim();

  if (isNaN(percent) || percent < 0 || percent > 75) {
    return bot.sendMessage(chatId, `⚠️ Phần trăm giảm giá phải từ 1 đến 75%.`);
  }

  await setEventStatus(true, percent, content);
  await bot.sendMessage(chatId, `✅ Đã kích hoạt sự kiện: Giảm **${percent}%**!\nNội dung: _${content}_`, { parse_mode: 'Markdown' });
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
    return bot.sendMessage(chatId, `⚠️ Cú pháp: \`/addvip <telegram_id>\``);
  }

  await addToVIP(targetId);
  await bot.sendMessage(chatId, `✅ Đã cấp VIP thành công cho Telegram ID: \`${targetId}\``, { parse_mode: 'Markdown' });
  await bot.sendMessage(targetId, `🎉 **CHÚC MỪNG!** Bạn đã được Admin cấp quyền **VIP Member** (Giảm 50% mọi đơn hàng)!`, { parse_mode: 'Markdown' }).catch(() => {});
}

/**
 * Xử lý lệnh text /delvip
 */
async function handleDelVIPCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  if (!checkIsAdmin(chatId)) return;

  const targetId = match[1] ? match[1].trim() : '';
  if (!targetId) {
    return bot.sendMessage(chatId, `⚠️ Cú pháp: \`/delvip <telegram_id>\``);
  }

  await removeFromVIP(targetId);
  await bot.sendMessage(chatId, `✅ Đã thu hồi VIP của Telegram ID: \`${targetId}\``, { parse_mode: 'Markdown' });
}

/**
 * Xử lý lệnh text /broadcast
 */
async function handleBroadcastCommand(bot, msg, match) {
  const chatId = msg.chat.id;
  if (!checkIsAdmin(chatId)) return;

  const content = match[1] ? match[1].trim() : '';
  if (!content) {
    return bot.sendMessage(chatId, `⚠️ Cú pháp: \`/broadcast <nội dung>\``);
  }

  const userIds = await getAllUserIds();
  await bot.sendMessage(chatId, `⏳ Đang bắt đầu gửi tin nhắn tới **${userIds.length}** người dùng...`, { parse_mode: 'Markdown' });

  let sentCount = 0;
  for (const uid of userIds) {
    try {
      await bot.sendMessage(uid, content, { parse_mode: 'Markdown' });
      sentCount++;
    } catch (e) {
      // Bỏ qua nếu user đã block bot
    }
    await new Promise(r => setTimeout(r, 100)); // độ trễ 100ms tránh flood
  }

  await bot.sendMessage(chatId, `✅ Đã gửi thành công tới **${sentCount}/${userIds.length}** người dùng!`, { parse_mode: 'Markdown' });
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
