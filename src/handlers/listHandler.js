const { getBooks, getBookById } = require('../database/booksRepo');
const { getCartCount, isBookInCart } = require('../database/cartRepo');
const { hasUserPurchased } = require('../database/purchasesRepo');
const { isUserVIP } = require('../database/vipRepo');
const { getActiveEvent } = require('../database/eventsRepo');
const { ITEMS_PER_PAGE } = require('../config/constants');
const { getBookListKeyboard, getBookDetailKeyboard } = require('../keyboards/bookKeyboards');
const { sendBookLinks } = require('../services/deliveryService');

/**
 * Hiển thị danh sách truyện (7 truyện/trang, mỗi truyện là 1 nút bấm, tối ưu siêu tốc với Cache)
 */
async function handleBookList(bot, chatId, page = 1, messageId = null) {
  try {
    const [allBooks, cartCount, isVIP, activeEvent] = await Promise.all([
      getBooks(),
      getCartCount(chatId),
      isUserVIP(chatId),
      getActiveEvent()
    ]);

    if (allBooks.length === 0) {
      const emptyText = `📚 Hiện tại chưa có cuốn truyện nào trong danh sách. Vui lòng quay lại sau!`;
      const emptyKeyboard = {
        inline_keyboard: [[{ text: "🏠 Menu Chính", callback_data: "nav_main" }]]
      };
      if (messageId) {
        return bot.editMessageText(emptyText, {
          chat_id: chatId, message_id: messageId, reply_markup: emptyKeyboard
        });
      }
      return bot.sendMessage(chatId, emptyText, { reply_markup: emptyKeyboard });
    }

    // Sắp xếp ID mới nhất lên đầu
    allBooks.sort((a, b) => b.id - a.id);

    const totalPages = Math.ceil(allBooks.length / ITEMS_PER_PAGE);
    let currentPage = parseInt(page, 10) || 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const chunk = allBooks.slice(start, start + ITEMS_PER_PAGE);

    let text = `📚 <b>DANH SÁCH TRUYỆN</b> (Trang ${currentPage}/${totalPages} - Tổng ${allBooks.length} truyện)\n\n`;

    if (isVIP) {
      text += `🎟️ <i>Bạn đang là VIP: Giảm 50% cho tất cả các truyện!</i>\n`;
    }
    if (activeEvent && activeEvent.content) {
      text += `🎉 <i>Sự kiện: Giảm thêm ${activeEvent.percent}%!</i>\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👇 <i>Bấm vào nút tên truyện bên dưới để xem thông tin chi tiết và thêm vào giỏ hàng:</i>`;

    const keyboard = getBookListKeyboard(chunk, currentPage, totalPages, cartCount);

    const options = {
      parse_mode: 'HTML',
      reply_markup: keyboard
    };

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options
      }).catch(async () => {
        await bot.sendMessage(chatId, text, options);
      });
    } else {
      await bot.sendMessage(chatId, text, options);
    }
  } catch (err) {
    console.error('❌ Lỗi handleBookList:', err.message);
  }
}

/**
 * Hiển thị màn hình chi tiết một cuốn truyện (Đường kẻ phân cách thoáng đãng, chống dính cục)
 */
async function handleBookDetail(bot, chatId, bookId, fromPage = 1, messageId = null) {
  try {
    const [book, inCart, isOwned, cartCount, isVIP] = await Promise.all([
      getBookById(bookId),
      isBookInCart(chatId, bookId),
      hasUserPurchased(chatId, bookId),
      getCartCount(chatId),
      isUserVIP(chatId)
    ]);

    if (!book) {
      return bot.sendMessage(chatId, `❌ Không tìm thấy thông tin cuốn truyện này.`);
    }

    let priceDisplay = book.free ? "🆓 Miễn phí" : `${book.price.toLocaleString('vi-VN')}đ`;
    if (!book.free && isVIP) {
      const vipPrice = Math.floor(book.price * 0.5);
      priceDisplay += ` (💎 VIP: ${vipPrice.toLocaleString('vi-VN')}đ)`;
    }

    let text = `📖 <b>THÔNG TIN TRUYỆN: #${book.id}</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📌 <b>Tên truyện:</b> ${escapeHtml(book.name)}\n`;
    text += `💰 <b>Giá bán:</b> <code>${priceDisplay}</code>\n`;
    text += `📚 <b>Số chương:</b> ${escapeHtml(book.chapters || 'Đang cập nhật')}\n`;
    text += `📏 <b>Độ dài:</b> ${escapeHtml(book.chapterLength || 'Đang cập nhật')}\n`;
    text += `🎭 <b>Thể loại:</b> ${escapeHtml(book.genres.length > 0 ? book.genres.join(', ') : 'Đang cập nhật')}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📝 <b>Tóm tắt nội dung:</b>\n<i>${escapeHtml(book.description || 'Chưa có mô tả')}</i>\n\n`;

    if (isOwned) {
      text += `✅ <b>Bạn đã mua và sở hữu cuốn truyện này trong Tủ truyện!</b>\n`;
    } else if (inCart) {
      text += `🛒 <i>Truyện này đang có sẵn trong Giỏ hàng của bạn.</i>\n`;
    }

    const keyboard = getBookDetailKeyboard(book, inCart, isOwned, fromPage, cartCount);

    const options = {
      parse_mode: 'HTML',
      reply_markup: keyboard
    };

    if (messageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options
      }).catch(async () => {
        await bot.sendMessage(chatId, text, options);
      });
    } else {
      await bot.sendMessage(chatId, text, options);
    }
  } catch (err) {
    console.error('❌ Lỗi handleBookDetail:', err.message);
  }
}

/**
 * Đọc ngay truyện miễn phí (không cần qua giỏ hàng)
 */
async function handleReadFreeBook(bot, chatId, bookId) {
  try {
    const book = await getBookById(bookId);
    if (!book || !book.free) {
      return bot.sendMessage(chatId, `⚠️ Cuốn truyện này không phải là truyện miễn phí.`);
    }

    await bot.sendMessage(
      chatId,
      `🎉 <b>TRUYỆN MIỄN PHÍ:</b> <i>${escapeHtml(book.name)}</i>\nLink truyện đang được gửi đến bạn ngay dưới đây!`,
      { parse_mode: 'HTML' }
    );

    await sendBookLinks(bot, chatId, [book], true);
  } catch (err) {
    console.error('❌ Lỗi handleReadFreeBook:', err.message);
  }
}

/**
 * Mở đọc truyện đã mua trước đó
 */
async function handleReadOwnedBook(bot, chatId, bookId) {
  try {
    const book = await getBookById(bookId);
    if (!book) {
      return bot.sendMessage(chatId, `⚠️ Không tìm thấy cuốn truyện này.`);
    }

    const isOwned = await hasUserPurchased(chatId, bookId);
    if (!isOwned && !book.free) {
      return bot.sendMessage(chatId, `⚠️ Bạn chưa sở hữu cuốn truyện này.`);
    }

    await bot.sendMessage(
      chatId,
      `📖 <b>TỦ TRUYỆN CỦA BẠN:</b> <i>${escapeHtml(book.name)}</i>\nLink truyện đang được gửi đến bạn ngay dưới đây!`,
      { parse_mode: 'HTML' }
    );

    await sendBookLinks(bot, chatId, [book], false);
  } catch (err) {
    console.error('❌ Lỗi handleReadOwnedBook:', err.message);
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
  handleBookList,
  handleBookDetail,
  handleReadFreeBook,
  handleReadOwnedBook
};
