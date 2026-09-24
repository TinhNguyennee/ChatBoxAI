const { ITEMS_PER_SEND_CHUNK } = require('../config/constants');
const { GUIDE_LINK, SUPPORT_USERNAME } = require('../config/env');

/**
 * Gửi link truyện theo từng chunk (3 truyện/part) để tránh rate limit của Telegram
 */
async function sendBookLinks(bot, chatId, books, isFree = false) {
  if (!chatId || !books || books.length === 0) return;

  const totalParts = Math.ceil(books.length / ITEMS_PER_SEND_CHUNK);

  for (let i = 0; i < books.length; i += ITEMS_PER_SEND_CHUNK) {
    const chunk = books.slice(i, i + ITEMS_PER_SEND_CHUNK);
    const partNumber = Math.floor(i / ITEMS_PER_SEND_CHUNK) + 1;

    const chunkLinks = chunk
      .map((b) => {
        let linkToUse = b.link || '';
        if (!linkToUse) return `${b.id}. ${b.name}\n(LINK KHÔNG CÓ)`;

        let linkParts = linkToUse.split(',').map(p => p.trim());
        let linksDisplay = linkParts
          .map((part, j) => {
            if (part.includes('(Part')) return part;
            if (linkParts.length > 1) return `Link part ${j + 1}: ${part}`;
            return part;
          })
          .join('\n');
        return `${b.id}. ${b.name}\n${linksDisplay}`;
      })
      .join('\n\n');

    let text = '';
    if (partNumber === 1) {
      if (isFree) {
        text += `🎉 **TẤT CẢ TRUYỆN BẠN CHỌN ĐỀU MIỄN PHÍ!**\n\n`;
      } else {
        text += `✅ **THANH TOÁN THÀNH CÔNG!**\n\nCảm ơn bạn đã ủng hộ! Truyện đã được thêm vào **Tủ truyện của bạn**.\n\n`;
        text += `📖 Hướng dẫn đọc trên điện thoại:\n${GUIDE_LINK}\n\n`;
      }
      text += `📚 **Truyện của bạn:**\n${chunkLinks}\n\n`;
    } else {
      text += `✅ **Tiếp tục danh sách (Phần ${partNumber}/${totalParts})**\n\nTruyện của bạn:\n${chunkLinks}\n\n`;
    }

    if (partNumber < totalParts) {
      text += `*(Còn phần sau...)*\n\n`;
    } else {
      text += `💡 Mẹo: Dùng ứng dụng Google Docs để đọc mượt nhất. Bạn có thể xem lại link bất cứ lúc nào trong mục **Tủ truyện của tôi**.\nCó vấn đề gì nhắn ${SUPPORT_USERNAME} nhé! Chúc bạn đọc truyện vui vẻ! 🔥`;
    }

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch(err => {
      console.error(`Lỗi gửi link truyện part ${partNumber}:`, err.message);
    });

    if (partNumber < totalParts) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

module.exports = {
  sendBookLinks
};
