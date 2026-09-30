const { getBookById } = require('../database/booksRepo');
const { hasUserPurchased } = require('../database/purchasesRepo');
const { isBookInCart, addMultipleToCart, getCartCount } = require('../database/cartRepo');

// Bộ nhớ tạm lưu danh sách ID truyện cho nút bấm hàng loạt (tránh vượt quá 64 bytes callback_data)
const batchSearchCache = new Map();

// Tự động dọn dẹp cache cũ sau 30 phút
function setBatchInCache(key, bookIds) {
  batchSearchCache.set(key, {
    bookIds,
    createdAt: Date.now()
  });

  // Dọn dẹp cache cũ nếu vượt quá 200 items
  if (batchSearchCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of batchSearchCache.entries()) {
      if (now - v.createdAt > 30 * 60 * 1000) {
        batchSearchCache.delete(k);
      }
    }
  }
}

function getBatchFromCache(key) {
  const item = batchSearchCache.get(key);
  if (!item) return null;
  return item.bookIds;
}

/**
 * Xử lý khi người dùng tìm kiếm nhiều ID truyện cùng lúc (ví dụ: '39 25 57 43')
 */
async function handleMultiBookSearch(bot, chatId, bookIds) {
  try {
    const uniqueIds = [...new Set(bookIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id)))];
    if (uniqueIds.length === 0) return;

    // Giới hạn tối đa 20 truyện mỗi lần tìm kiếm để không spam tin nhắn
    const targetIds = uniqueIds.slice(0, 20);

    const bookResults = await Promise.all(
      targetIds.map(async (id) => {
        const book = await getBookById(id);
        if (!book) return { id, notFound: true };

        const [isOwned, inCart] = await Promise.all([
          hasUserPurchased(chatId, id),
          isBookInCart(chatId, id)
        ]);

        return {
          id: book.id,
          name: book.name,
          price: book.price,
          chapters: book.chapters,
          free: book.free,
          isOwned,
          inCart,
          notFound: false
        };
      })
    );

    let text = `🔍 <b>KẾT QUẢ TÌM KIẾM (${bookResults.length} TRUYỆN)</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━\n\n`;

    const eligibleToAdd = [];

    bookResults.forEach((b, index) => {
      const stt = index + 1;
      if (b.notFound) {
        text += `${stt}. ❌ <b>#${b.id}</b>: <i>Không tìm thấy trong kho sách</i>\n\n`;
        return;
      }

      text += `${stt}. 📖 <b>#${b.id} ${escapeHtml(b.name)}</b>\n`;

      if (b.isOwned) {
        text += `   ✅ <b>Đã sở hữu</b> (Đã có trong Tủ truyện của bạn)\n\n`;
      } else if (b.inCart) {
        text += `   🛒 <i>Đã có sẵn trong Giỏ hàng</i>\n\n`;
      } else if (b.free) {
        text += `   🎁 <b>Truyện Miễn Phí</b> (Bấm #<code>${b.id}</code> để lấy link đọc)\n\n`;
      } else {
        text += `   💰 Giá: <b>${b.price.toLocaleString('vi-VN')}đ</b> | ${b.chapters} chương\n`;
        text += `   ⚪ <i>Chưa thêm vào giỏ</i>\n\n`;
        eligibleToAdd.push(b.id);
      }
    });

    text += `━━━━━━━━━━━━━━━━━━\n`;

    const inline_keyboard = [];

    if (eligibleToAdd.length > 0) {
      const batchKey = Math.random().toString(36).substring(2, 10);
      setBatchInCache(batchKey, eligibleToAdd);

      text += `💡 <i>Có <b>${eligibleToAdd.length} truyện</b> có thể thêm vào giỏ hàng ngay.</i>`;

      inline_keyboard.push([
        {
          text: `🛒 Cho tất cả (${eligibleToAdd.length} truyện) vào giỏ hàng`,
          callback_data: `batch_cart:${batchKey}`
        }
      ]);
    } else {
      text += `✨ <i>Tất cả truyện tìm kiếm đều đã có trong giỏ hoặc bạn đã sở hữu!</i>`;
    }

    inline_keyboard.push([
      { text: "🛍 Xem Giỏ Hàng", callback_data: "nav_cart" },
      { text: "🏠 Menu Chính", callback_data: "nav_main" }
    ]);

    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard }
    });

  } catch (err) {
    console.error('❌ Lỗi handleMultiBookSearch:', err.message);
    await bot.sendMessage(chatId, '⚠️ Đã xảy ra lỗi khi tìm kiếm truyện. Vui lòng thử lại sau!');
  }
}

/**
 * Xử lý khi bấm nút "Cho tất cả vào giỏ hàng"
 */
async function handleBatchAddToCart(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data; // batch_cart:<key>
  const batchKey = data.split(':')[1];

  const bookIds = getBatchFromCache(batchKey);
  if (!bookIds || bookIds.length === 0) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '⚠️ Yêu cầu đã hết hạn hoặc các truyện đã được thêm trước đó. Vui lòng tìm kiếm lại!',
      show_alert: true
    }).catch(() => {});
  }

  // Thêm hàng loạt vào giỏ
  const addedCount = await addMultipleToCart(chatId, bookIds);
  const totalCart = await getCartCount(chatId);

  // Xóa cache key sau khi đã dùng
  batchSearchCache.delete(batchKey);

  await bot.answerCallbackQuery(callbackQuery.id, {
    text: `🎉 Đã thêm thành công ${bookIds.length} truyện vào Giỏ hàng!`,
    show_alert: true
  }).catch(() => {});

  // Cập nhật lại tin nhắn báo đã thêm thành công
  const updatedKeyboard = {
    inline_keyboard: [
      [{ text: `🛍 Mở Giỏ Hàng (${totalCart} truyện)`, callback_data: "nav_cart" }],
      [{ text: "🏠 Về Menu Chính", callback_data: "nav_main" }]
    ]
  };

  const notifyText = callbackQuery.message.text 
    ? `${callbackQuery.message.text}\n\n✅ <b>ĐÃ THÊM TOÀN BỘ ${bookIds.length} TRUYỆN VÀO GIỎ HÀNG THÀNH CÔNG!</b>`
    : `✅ <b>Đã thêm thành công ${bookIds.length} truyện vào Giỏ hàng!</b>`;

  await bot.editMessageText(notifyText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    reply_markup: updatedKeyboard
  }).catch(async () => {
    await bot.sendMessage(chatId, `✅ <b>Đã thêm ${bookIds.length} truyện vào Giỏ hàng thành công!</b>`, {
      parse_mode: 'HTML',
      reply_markup: updatedKeyboard
    });
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
  handleMultiBookSearch,
  handleBatchAddToCart
};
