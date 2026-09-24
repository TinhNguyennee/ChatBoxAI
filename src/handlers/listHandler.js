const { getBooks, getBookById } = require('../database/booksRepo');
const { getCartCount, isBookInCart } = require('../database/cartRepo');
const { hasUserPurchased } = require('../database/purchasesRepo');
const { isUserVIP } = require('../database/vipRepo');
const { getActiveEvent } = require('../database/eventsRepo');
const { ITEMS_PER_PAGE } = require('../config/constants');
const { getBookListKeyboard, getBookDetailKeyboard } = require('../keyboards/bookKeyboards');
const { sendBookLinks } = require('../services/deliveryService');

/**
 * Hiển thị danh sách truyện (5 truyện/trang, mỗi truyện là 1 nút bấm)
 */
async function handleBookList(bot, chatId, page = 1, messageId = null) {
  try {
    const allBooks = await getBooks();
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

    // Sắp xếp ID mới nhất lên đầu hoặc theo thứ tự chuẩn
    allBooks.sort((a, b) => b.id - a.id);

    const totalPages = Math.ceil(allBooks.length / ITEMS_PER_PAGE);
    let currentPage = parseInt(page, 10) || 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const chunk = allBooks.slice(start, start + ITEMS_PER_PAGE);

    const cartCount = await getCartCount(chatId);
    const isVIP = await isUserVIP(chatId);
    const activeEvent = await getActiveEvent();

    let text = `📚 **DANH SÁCH TRUYỆN** (Trang ${currentPage}/${totalPages} - Tổng ${allBooks.length} truyện)\n\n`;

    if (isVIP) {
      text += `🎟️ *Bạn đang là VIP: Giảm 50% cho tất cả các truyện!*\n`;
    }
    if (activeEvent && activeEvent.content) {
      text += `🎉 *Sự kiện: Giảm thêm ${activeEvent.percent}%!*\n`;
    }
    text += `\n👇 **Bấm vào nút tên truyện bên dưới để xem thông tin chi tiết và thêm vào giỏ hàng:**`;

    const keyboard = getBookListKeyboard(chunk, currentPage, totalPages, cartCount);

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
  } catch (err) {
    console.error('❌ Lỗi handleBookList:', err.message);
  }
}

/**
 * Hiển thị màn hình chi tiết một cuốn truyện
 */
async function handleBookDetail(bot, chatId, bookId, fromPage = 1, messageId = null) {
  try {
    const book = await getBookById(bookId);
    if (!book) {
      return bot.sendMessage(chatId, `❌ Không tìm thấy thông tin cuốn truyện này.`);
    }

    const inCart = await isBookInCart(chatId, bookId);
    const isOwned = await hasUserPurchased(chatId, bookId);
    const cartCount = await getCartCount(chatId);
    const isVIP = await isUserVIP(chatId);

    let priceDisplay = book.free ? "🆓 Miễn phí" : `${book.price.toLocaleString('vi-VN')}đ`;
    if (!book.free && isVIP) {
      const vipPrice = Math.floor(book.price * 0.5);
      priceDisplay += ` (💎 VIP: ${vipPrice.toLocaleString('vi-VN')}đ)`;
    }

    let text = `📖 **THÔNG TIN TRUYỆN: #${book.id}**\n\n`;
    text += `📌 **Tên truyện:** ${book.name}\n`;
    text += `💰 **Giá bán:** ${priceDisplay}\n`;
    text += `📚 **Số chương:** ${book.chapters || 'Đang cập nhật'}\n`;
    text += `📏 **Độ dài:** ${book.chapterLength || 'Đang cập nhật'}\n`;
    text += `🎭 **Thể loại:** ${book.genres.length > 0 ? book.genres.join(', ') : 'Đang cập nhật'}\n`;
    text += `📝 **Tóm tắt nội dung:**\n_${book.description || 'Chưa có mô tả'}_\n\n`;

    if (isOwned) {
      text += `✅ *Bạn đã mua và sở hữu cuốn truyện này trong Tủ truyện!*\n`;
    } else if (inCart) {
      text += `🛒 *Truyện này đang có sẵn trong Giỏ hàng của bạn.*\n`;
    }

    const keyboard = getBookDetailKeyboard(book, inCart, isOwned, fromPage, cartCount);

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
      `🎉 **TRUYỆN MIỄN PHÍ:** *${book.name}*\nLink truyện đang được gửi đến bạn ngay dưới đây!`
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
      `📖 **TỦ TRUYỆN CỦA BẠN:** *${book.name}*\nLink truyện đang được gửi đến bạn ngay dưới đây!`
    );

    await sendBookLinks(bot, chatId, [book], false);
  } catch (err) {
    console.error('❌ Lỗi handleReadOwnedBook:', err.message);
  }
}

module.exports = {
  handleBookList,
  handleBookDetail,
  handleReadFreeBook,
  handleReadOwnedBook
};
