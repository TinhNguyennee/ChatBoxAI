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

      const validLinks = extractLinks(b.link);
      if (validLinks.length === 0) {
        text += `✅ <i>Đã được cập nhật vào Tủ truyện của bạn!</i>\n`;
      } else {
        validLinks.forEach((item) => {
          const partLabel = validLinks.length > 1 ? `Link ${item.label}` : `Link đọc truyện`;
          text += `🔗 ${partLabel}: <a href="${item.url}">👉 Bấm vào đây để đọc</a>\n`;
        });
      }
    });
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (partNumber < totalParts) {
      text += `<i>(Còn tiếp phần sau...)</i>\n\n`;
    } else {
      text += `💡 <b>Mẹo:</b> Dùng app Google Docs để đọc mượt nhất. Bạn có thể mở lại bất cứ lúc nào trong mục <b>Tủ truyện của tôi</b>.\nChúc bạn đọc truyện thật vui vẻ! 🔥`;
    }

    // Tạo các nút điều hướng tiện lợi ở cuối danh sách truyện
    const inlineButtons = [];
    if (partNumber === totalParts) {
      inlineButtons.push([
        { text: "📚 Mở Tủ Truyện Của Tôi", callback_data: "my_books:1" },
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

function extractLinks(linkStr) {
  if (!linkStr) return [];
  const rawParts = String(linkStr).split(/,|\n/).map(p => p.trim()).filter(Boolean);
  const links = [];

  rawParts.forEach((part, idx) => {
    const urlMatch = part.match(/(https?:\/\/[^\s)"]+)/i);
    if (urlMatch) {
      const url = urlMatch[1];
      const labelMatch = part.match(/\(([^)]+)\)/);
      const label = labelMatch ? labelMatch[1] : (rawParts.length > 1 ? `Phần ${idx + 1}` : 'Đọc ngay');
      links.push({ url, label });
    }
  });

  return links;
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
  sendBookLinks
};
