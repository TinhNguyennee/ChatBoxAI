const { getUserPurchases } = require('../database/purchasesRepo');
const { ITEMS_PER_PAGE } = require('../config/constants');

/**
 * Hiển thị danh sách truyện đã mua (Tủ truyện của tôi)
 */
async function handleMyBooks(bot, chatId, page = 1, messageId = null) {
  try {
    const purchasedBooks = await getUserPurchases(chatId);

    if (purchasedBooks.length === 0) {
      const emptyText = 
        `📖 **TỦ TRUYỆN CỦA BẠN ĐANG TRỐNG**\n\n` +
        `Bạn chưa mua cuốn truyện nào. Hãy khám phá kho truyện và chọn cho mình cuốn ưng ý nhé!`;
      const emptyKeyboard = {
        inline_keyboard: [
          [{ text: "📚 Khám Phá Kho Truyện", callback_data: "nav_list:1" }],
          [{ text: "🏠 Menu Chính", callback_data: "nav_main" }]
        ]
      };

      if (messageId) {
        return bot.editMessageText(emptyText, {
          chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: emptyKeyboard
        }).catch(async () => {
          await bot.sendMessage(chatId, emptyText, { parse_mode: 'Markdown', reply_markup: emptyKeyboard });
        });
      }
      return bot.sendMessage(chatId, emptyText, { parse_mode: 'Markdown', reply_markup: emptyKeyboard });
    }

    const totalPages = Math.ceil(purchasedBooks.length / ITEMS_PER_PAGE);
    let currentPage = parseInt(page, 10) || 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const chunk = purchasedBooks.slice(start, start + ITEMS_PER_PAGE);

    let text = `📖 **TỦ TRUYỆN CỦA TÔI** (Trang ${currentPage}/${totalPages} - Sở hữu ${purchasedBooks.length} truyện)\n\n`;
    text += `Toàn bộ link đọc truyện bạn đã mua được lưu trữ vĩnh viễn tại đây.\n`;
    text += `👇 **Bấm vào truyện bên dưới để lấy link đọc lại bất kỳ lúc nào:**`;

    const keyboard = [];
    chunk.forEach((book) => {
      const displayName = book.name.length > 25 ? book.name.substring(0, 23) + '...' : book.name;
      keyboard.push([
        { text: `📖 #${book.id}. ${displayName}`, callback_data: `read_owned:${book.id}` }
      ]);
    });

    if (totalPages > 1) {
      const navRow = [];
      navRow.push({ text: '⏮️', callback_data: currentPage === 1 ? 'noop' : 'my_books:1' });
      navRow.push({ text: '◀️', callback_data: currentPage > 1 ? `my_books:${currentPage - 1}` : 'noop' });
      navRow.push({ text: `【 ${currentPage}/${totalPages} 】`, callback_data: 'noop' });
      navRow.push({ text: '▶️', callback_data: currentPage < totalPages ? `my_books:${currentPage + 1}` : 'noop' });
      navRow.push({ text: '⏭️', callback_data: currentPage === totalPages ? 'noop' : `my_books:${totalPages}` });
      keyboard.push(navRow);
    }

    keyboard.push([
      { text: "📚 Mua Thêm Truyện", callback_data: "nav_list:1" },
      { text: "🏠 Menu Chính", callback_data: "nav_main" }
    ]);

    const markup = { inline_keyboard: keyboard };

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: markup
      }).catch(async () => {
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: markup });
      });
    } else {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: markup
      });
    }
  } catch (err) {
    console.error('❌ Lỗi handleMyBooks:', err.message);
  }
}

module.exports = {
  handleMyBooks
};
