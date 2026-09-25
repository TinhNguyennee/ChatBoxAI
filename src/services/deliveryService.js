const { ITEMS_PER_SEND_CHUNK } = require('../config/constants');
const { GUIDE_LINK, SUPPORT_USERNAME } = require('../config/env');

/**
 * Gửi link truyện theo từng chunk (3 truyện/part), format đẹp mắt, chống dính cục và an toàn với link URL
 */
async function sendBookLinks(bot, chatId, books, isFree = false) {
  if (!chatId || !books || books.length === 0) return;

  const totalParts = Math.ceil(books.length / ITEMS_PER_SEND_CHUNK);

  for (let i = 0; i < books.length; i += ITEMS_PER_SEND_CHUNK) {
    const chunk = books.slice(i, i + ITEMS_PER_SEND_CHUNK);
    const partNumber = Math.floor(i / ITEMS_PER_SEND_CHUNK) + 1;

    let text = '';

    if (partNumber === 1) {
      if (isFree) {
        text += `🎉 <b>TẤT CẢ TRUYỆN BẠN CHỌN ĐỀU MIỄN PHÍ!</b>\n\n`;
      } else {
        text += `✅ <b>THANH TOÁN THÀNH CÔNG!</b>\n\n`;
        text += `Cảm ơn bạn đã ủng hộ! Truyện đã được lưu vĩnh viễn vào <b>Tủ truyện của bạn</b>.\n\n`;
        text += `📖 Hướng dẫn đọc trên điện thoại: <a href="${GUIDE_LINK}">Xem tại đây</a>\n\n`;
      }
      text += `📚 <b>DANH SÁCH TRUYỆN CỦA BẠN:</b>\n`;
    } else {
      text += `✅ <b>Tiếp tục danh sách (Phần ${partNumber}/${totalParts})</b>\n\n`;
    }

    // Format từng truyện rõ ràng, có đường kẻ phân cách chống dính cục
    chunk.forEach((b) => {
      text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      text += `📖 <b>#${b.id}. ${escapeHtml(b.name)}</b>\n`;

      let linkToUse = b.link || '';
      if (!linkToUse) {
        text += `⚠️ <i>(Link đang cập nhật, vui lòng liên hệ ${SUPPORT_USERNAME})</i>\n`;
      } else {
        let linkParts = linkToUse.split(',').map(p => p.trim());
        linkParts.forEach((part, j) => {
          const partLabel = linkParts.length > 1 ? `Link Part ${j + 1}` : `Link đọc truyện`;
          text += `🔗 ${partLabel}: <a href="${part}">Bấm vào đây để đọc</a>\n`;
        });
      }
    });
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (partNumber < totalParts) {
      text += `<i>(Còn tiếp phần sau...)</i>\n\n`;
    } else {
      text += `💡 <b>Mẹo:</b> Dùng app Google Docs để đọc mượt nhất. Bạn có thể mở lại bất cứ lúc nào trong mục <b>Tủ truyện của tôi</b>.\nCó vấn đề gì nhắn ${SUPPORT_USERNAME} nhé! Chúc bạn đọc truyện vui vẻ! 🔥`;
    }

    // Tạo các nút bấm tương tác nhanh bên dưới tin nhắn
    const inlineButtons = [];
    chunk.forEach(b => {
      let mainLink = (b.link || '').split(',')[0].trim();
      if (mainLink && mainLink.startsWith('http')) {
        const shortTitle = b.name.length > 18 ? b.name.substring(0, 16) + '...' : b.name;
        inlineButtons.push([{ text: `📖 Đọc: #${b.id}. ${shortTitle}`, url: mainLink }]);
      }
    });

    if (partNumber === totalParts) {
      inlineButtons.push([
        { text: "📖 Mở Tủ Truyện Của Tôi", callback_data: "my_books:1" },
        { text: "🏠 Menu Chính", callback_data: "nav_main" }
      ]);
    }

    const options = {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (inlineButtons.length > 0) {
      options.reply_markup = { inline_keyboard: inlineButtons };
    }

    try {
      await bot.sendMessage(chatId, text, options);
    } catch (err) {
      console.error(`Lỗi gửi link truyện part ${partNumber} (HTML mode):`, err.message);
      // Fallback gửi plain text an toàn 100% nếu HTML bị lỗi
      const plainText = text.replace(/<[^>]*>/g, '');
      await bot.sendMessage(chatId, plainText, { disable_web_page_preview: true }).catch(() => {});
    }

    if (partNumber < totalParts) {
      await new Promise(r => setTimeout(r, 1200));
    }
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
  sendBookLinks
};
