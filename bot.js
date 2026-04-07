const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const express = require("express");
const bodyParser = require("body-parser");

// TOKEN từ env
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });

// Kết nối Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Khởi tạo Express
const app = express();
app.use(bodyParser.json());

// Nơi lưu đơn hàng tạm thời
const orders = {};

// Tạo mã đơn
function createOrderId() {
  return "OD" + Math.floor(Math.random() * 1000000);
}

// ======================
//   CÁC HÀM VIP + SOLD QUANTITY (ĐÃ FIX)
// ======================

// Kiểm tra user có phải VIP không - ĐÃ FIX AN TOÀN
async function isUserVIP(chatId) {
  if (!chatId) return false;

  try {
    const res = await pool.query(
      'SELECT 1 FROM vip WHERE telegram_id = $1 LIMIT 1', 
      [chatId.toString()]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('❌ Lỗi check VIP:', err.message);
    return false;
  }
}

// Thêm user vào bảng VIP
async function addToVIP(chatId) {
  if (!chatId) return;
  try {
    await pool.query(
      'INSERT INTO vip (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
      [chatId.toString()]
    );
    console.log(`✅ Đã cấp VIP cho Telegram ID: ${chatId}`);
  } catch (err) {
    console.error('❌ Lỗi thêm VIP:', err.message);
  }
}

// Tăng sold_quantity
async function incrementSoldQuantity(bookIds) {
  if (!bookIds || bookIds.length === 0) return;

  try {
    await pool.query(
      'UPDATE books SET sold_quantity = COALESCE(sold_quantity, 0) + 1 WHERE id = ANY($1)',
      [bookIds]
    );
    console.log(`📈 Đã +1 sold_quantity cho ${bookIds.length} truyện (ID: ${bookIds.join(', ')})`);
  } catch (err) {
    console.error('❌ Lỗi update sold_quantity:', err.message);
  }
}

// Lấy danh sách truyện
async function getBooks() {
  try {
    const res = await pool.query('SELECT * FROM books ORDER BY id ASC');
    return res.rows.map(row => ({
      id: row.id,
      name: row.name,
      chapters: row.chapters,
      chapterLength: row.chapterlength,
      description: row.description,
      free: row.free,
      price: row.price,
      link: row.link || '',
      genres: row.genres ? row.genres.split(', ') : []
    }));
  } catch (err) {
    console.error('❌ Lỗi query books:', err.message);
    return [];
  }
}

// Gửi link theo chunk
async function sendBookLinks(chatId, books, isFree = false) {
  if (!chatId || !books || books.length === 0) return;

  const ITEMS_PER_PART = 3;
  const totalParts = Math.ceil(books.length / ITEMS_PER_PART);

  for (let i = 0; i < books.length; i += ITEMS_PER_PART) {
    const chunk = books.slice(i, i + ITEMS_PER_PART);
    const partNumber = Math.floor(i / ITEMS_PER_PART) + 1;

    const chunkLinks = chunk
      .map((b) => {
        let linkStr = (b.link || '').trim();
        if (!linkStr) return `${b.id}. ${b.name}\n(LINK KHÔNG CÓ)`;
        
        let linkParts = linkStr.split(', ').map(p => p.trim());
        let linksDisplay = linkParts
          .map((part, j) => {
            if (part.includes('(Part')) return part;
            if (linkParts.length > 1) return `Link part ${j + 1}: ${part}`;
            return part;
          })
          .join("\n");
        return `${b.id}. ${b.name}\n${linksDisplay}`;
      })
      .join("\n\n");

    let text = "";

    if (partNumber === 1) {
      if (isFree) {
        text += `🎉 TẤT CẢ TRUYỆN BẠN CHỌN ĐỀU MIỄN PHÍ!\n\n`;
      } else {
        text += `✅ THANH TOÁN THÀNH CÔNG!\n\n`;
        text += `Cảm ơn bạn đã ủng hộ! Truyện đã mở khóa.\n\n`;
        text += `Hướng dẫn đọc trên điện thoại:\n`;
        text += `https://docs.google.com/document/d/1HYw_H1AzUoQwZudRZg3da4VlzMK7PEf-ey5jD2syMCY/edit?usp=sharing\n\n`;
      }
      text += `Truyện của bạn:\n${chunkLinks}\n\n`;
    } else {
      text += `✅ Tiếp tục danh sách (Phần ${partNumber}/${totalParts})\n\n`;
      text += `Truyện của bạn:\n${chunkLinks}\n\n`;
    }

    if (partNumber < totalParts) {
      text += `(Còn phần sau...)\n\n`;
    } else {
      text += `Mẹo: Dùng app Google Docs để đọc mượt. Có vấn đề gì nhắn @ea7bpp nhé!\n`;
      text += `Chúc đọc vui! 🔥`;
    }

    await bot.sendMessage(chatId, text);
    if (partNumber < totalParts) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// ======================
//       WEBHOOK
// ======================

app.post("/sepay", async (req, res) => {
  console.log("Webhook Sepay nhận:", JSON.stringify(req.body, null, 2));

  let data = req.body;
  let content = (data.content || data.description || "").trim().toUpperCase();
  let amount = data.transferAmount || data.amount;

  let orderId = Object.keys(orders).find(id => content.includes(id));
  if (!orderId) {
    console.log("Không tìm thấy orderId:", content);
    return res.send("ok");
  }

  let order = orders[orderId];
  if (!order || order.paid) {
    console.log("Order không tồn tại hoặc đã paid:", orderId);
    return res.send("ok");
  }

  if (order.amount !== amount) {
    console.log(`Số tiền không khớp: nhận ${amount}, cần ${order.amount}`);
    return res.send("ok");
  }

  order.paid = true;
  console.log(`✅ Thanh toán OK đơn ${orderId}`);

  try {
    if (order.isVIP) {
      await addToVIP(order.chatId);
      await bot.sendMessage(order.chatId, 
        `🎉 THANH TOÁN VIP THÀNH CÔNG!\n\n` +
        `💎 Bạn đã trở thành VIP Member.\n` +
        `Từ nay mọi lần mua truyện sẽ được giảm thêm 50% (sau ưu đãi cũ).\n\n` +
        `Cảm ơn bạn đã ủng hộ Truyện Ếch Xanh! 🔥`
      );
    } else {
      const bookIds = order.books.map(b => b.id);
      await incrementSoldQuantity(bookIds);
      await sendBookLinks(order.chatId, order.books, false);
    }
  } catch (err) {
    console.error(`❌ LỖI XỬ LÝ ĐƠN ${orderId}:`, err.message);
    if (order.chatId) {
      await bot.sendMessage(order.chatId, 
        `✅ Thanh toán OK nhưng có lỗi hệ thống.\n` +
        `Nhắn @ea7bpp kèm mã đơn ${orderId} để hỗ trợ ngay!`
      );
    }
  }

  delete orders[orderId];
  res.send("ok");
});

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const url = "https://chatboxai-eoul.onrender.com";
bot.setWebHook(`${url}/bot${token}`)
  .then(() => console.log('✅ Webhook Telegram đã được set thành công'))
  .catch(err => console.error('❌ Lỗi set webhook Telegram:', err.message));

// ======================
//   GLOBAL ERROR HANDLER (RẤT QUAN TRỌNG)
// ======================
bot.on('error', (err) => console.error('❌ Bot error:', err.message));
bot.on('polling_error', (err) => console.error('❌ Polling error:', err.message));

// ======================
//       BOT LOGIC
// ======================

// Phân trang
function getPageNumberButtons(currentPage, totalPages) {
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  const buttons = [];

  for (let p = startPage; p <= endPage; p++) {
    if (p === currentPage) {
      buttons.push({ text: `【${p}】` });
    } else {
      buttons.push({ text: `${p}`, callback_data: `list_page:${p}` });
    }
  }
  return buttons;
}

// Generate danh sách truyện - ĐÃ FIX CHẮC CHẮN
async function generateListPage(page = 1, chatId = null) {
  try {
    let books = await getBooks();
    if (books.length === 0) {
      return { 
        text: 'Hiện chưa có truyện nào trong database 😢.', 
        inlineKeyboard: [] 
      };
    }

    books.sort((a, b) => b.id - a.id);
    const ITEMS_PER_MESSAGE = 3;
    const totalPages = Math.ceil(books.length / ITEMS_PER_MESSAGE);
    
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * ITEMS_PER_MESSAGE;
    const chunk = books.slice(start, start + ITEMS_PER_MESSAGE);

    let text = `📚 Danh sách truyện (Trang ${page}/${totalPages})\n\n`;

    // Kiểm tra VIP an toàn
    if (chatId) {
      const isVIP = await isUserVIP(chatId);
      if (isVIP) {
        text += `🎟️ BẠN ĐANG LÀ VIP MEMBER → Giảm thêm 50% trên mọi đơn hàng\n\n`;
      } else {
        text += `💎 Chưa là VIP? Giảm 50% hóa đơn vĩnh viễn chỉ với 139k → Gõ /start để mua\n\n`;
      }
    }

    chunk.forEach(b => {
      text += `-----------------------------\n\n`;
      text += `${b.id}. ${b.name}\n`;
      text += `   📖 Số chương: ${b.chapters}\n`;
      text += `   📏 Độ dài: ${b.chapterLength}\n`;
      text += `   🎭 Thể loại: ${b.genres.join(", ")}\n`;

      // ========== GIỚI HẠN NỘI DUNG 90 KÝ TỰ ==========
      let description = b.description ? String(b.description).trim() : '';
      if (description.length > 75) {
        description = description.substring(0, 72) + '...';
      }
      text += `   📝 Nội dung: ${description}\n`;
      
      text += `   💰 Giá: ${b.free ? "Free" : b.price.toLocaleString('vi-VN') + "đ"}\n\n`;
    });

    text += `✍ Nhập số tương ứng với truyện bạn muốn mua (cách nhau bằng dấu cách nếu mua nhiều).\n`;
    text += `Ví dụ: \`1 3 5\`\nHoặc gõ \`full\` để mua toàn bộ truyện!`;

    const inlineKeyboard = [];

    const topRow = [
      { text: '⏪ Trang đầu', callback_data: page === 1 ? 'noop:first' : 'list_page:1' },
      { text: '◀️ Trang trước', callback_data: page > 1 ? `list_page:${page - 1}` : 'noop:first' }
    ];
    inlineKeyboard.push(topRow);

    inlineKeyboard.push(getPageNumberButtons(page, totalPages));

    const bottomRow = [
      { text: '▶️ Trang sau', callback_data: page < totalPages ? `list_page:${page + 1}` : 'noop:last' },
      { text: 'Trang cuối ⏩', callback_data: page === totalPages ? 'noop:last' : `list_page:${totalPages}` }
    ];
    inlineKeyboard.push(bottomRow);

    return { text, inlineKeyboard };
  } catch (err) {
    console.error("❌ Lỗi generateListPage:", err.message);
    return { 
      text: 'Có lỗi khi tải danh sách truyện 😵.\n\nVui lòng thử lại sau hoặc nhắn @ea7bpp hỗ trợ.', 
      inlineKeyboard: [] 
    };
  }
}

// ======================
//   START COMMAND
// ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const isVIP = await isUserVIP(chatId);

  let welcomeText = `🐸 Chào mừng bạn đến với Truyện Ếch Xanh\n\n`;

  if (isVIP) {
    welcomeText += `🎟️ BẠN ĐANG LÀ VIP MEMBER\n`;
    welcomeText += `💎 Được giảm 50% vĩnh viễn trên mọi lần mua truyện\n\n`;
    welcomeText += `Bạn có thể mua truyện ngay với giá siêu ưu đãi!\n\n`;
  } else {
    welcomeText += `💎 VIP Member - Chỉ 139.000đ (một lần mua):\n`;
    welcomeText += `• Giảm ngay 50% trên tổng hóa đơn (sau ưu đãi mua nhiều/full)\n`;
    welcomeText += `• Áp dụng vĩnh viễn cho mọi lần mua sau\n\n`;
  }

  welcomeText += `Ưu đãi mua nhiều vẫn áp dụng bình thường:\n`;
  welcomeText += `• Từ bộ thứ 3 giảm 20k\n`;
  welcomeText += `• Từ bộ thứ 4 giảm thêm 10k/bộ\n`;
  welcomeText += `• Mua FULL giảm thêm 5k/truyện\n\n`;

  welcomeText += `Chọn ngay bên dưới nhé! 🔥`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "📚 Xem Danh Sách Truyện", callback_data: "show_list" }],
      isVIP 
        ? [{ text: "✅ Bạn đã là VIP Member", callback_data: "already_vip" }]
        : [{ text: "💎 Mua VIP (139k) - Vĩnh viễn", callback_data: "buy_vip" }]
    ]
  };

  await bot.sendMessage(chatId, welcomeText, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard 
  });
});

// /list
bot.onText(/\/list/, async (msg) => {
  const { text, inlineKeyboard } = await generateListPage(1, msg.chat.id);
  await bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
});

// /id
bot.onText(/\/id/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username ? `@${msg.from.username}` : "Không có username";

  const text = `🆔 **Telegram ID của bạn là:**\n\n` +
               `\`${chatId}\`\n\n` +
               `📌 Username: ${username}\n\n`;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// Callback Query
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;

  await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  if (data === 'buy_vip') {
    const alreadyVIP = await isUserVIP(chatId);
    if (alreadyVIP) {
      await bot.sendMessage(chatId, '🎟️ Bạn đã là VIP Member rồi! Không cần mua lại nhé.');
      return;
    }

    const vipPrice = 139000;
    const orderId = createOrderId();

    orders[orderId] = {
      chatId: chatId,
      isVIP: true,
      amount: vipPrice,
      paid: false
    };

    const content = orderId;
    const qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${vipPrice}&addInfo=${content}`;

    const caption = `💎 MUA VIP MEMBER - 139.000đ\n\n` +
      `Sau khi thanh toán bạn sẽ được:\n` +
      `• Giảm 50% hóa đơn vĩnh viễn khi mua truyện\n\n` +
      `🧾 Mã đơn hàng: \`${orderId}\`\n` +
      `📝 Nội dung chuyển khoản: \`${content}\`\n\n` +
      `Quét mã QR hoặc chuyển khoản MB Bank 0550767799967\n` +
      `Bot sẽ tự động xác nhận ngay khi nhận tiền!`;

    await bot.sendPhoto(chatId, qrLink, { caption, parse_mode: 'Markdown' });
    return;
  }

  if (data === 'already_vip') {
    await bot.sendMessage(chatId, '✅ Bạn đã là VIP Member rồi!');
    return;
  }

  if (data === 'show_list') {
    const { text, inlineKeyboard } = await generateListPage(1, chatId);
    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
    return;
  }

  if (data === 'noop:first') {
    await bot.sendMessage(chatId, '✅ Bạn đang ở trang đầu rồi!');
    return;
  }

  if (data === 'noop:last') {
    await bot.sendMessage(chatId, '✅ Bạn đang ở trang cuối rồi!');
    return;
  }

  if (data.startsWith('list_page:')) {
    const requestedPage = parseInt(data.split(':')[1]);
    const { text, inlineKeyboard } = await generateListPage(requestedPage, chatId);

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    }).catch(err => console.error('Lỗi edit message:', err.message));
  }
});

// Xử lý tin nhắn chọn truyện
bot.on("message", async (msg) => {
  let text = msg.text;
  if (!text || text.startsWith('/')) return;

  const lowerText = text.toLowerCase().trim();
  const isFullPurchase = (lowerText === 'full' || lowerText === 'mua full');

  let ids = [];
  if (!isFullPurchase) {
    if (/^[0-9 ]+$/.test(text)) {
      ids = text.split(" ").map(Number).filter(n => !isNaN(n));
    } else {
      return;
    }
  }

  const allBooks = await getBooks();
  let selected = isFullPurchase ? allBooks : allBooks.filter(b => ids.includes(b.id));

  if (selected.length === 0) {
    return bot.sendMessage(msg.chat.id, 'Không tìm thấy truyện nào với số bạn nhập 😕.');
  }

  let paidBooks = selected.filter(b => !b.free);
  let total = paidBooks.reduce((s, b) => s + b.price, 0);
  let count = paidBooks.length;

  let discount = 0;
  if (count >= 3) discount += 20000;
  if (count >= 4) discount += (count - 3) * 10000;
  if (isFullPurchase && count > 0) discount += count * 5000;

  const isVIP = await isUserVIP(msg.chat.id);
  let final = total - discount;
  let vipDiscountText = '';

  if (isVIP && final > 0) {
    const afterOldDiscount = final;
    final = Math.floor(afterOldDiscount / 2);
    vipDiscountText = `💎 Giảm VIP 50%: -${(afterOldDiscount - final).toLocaleString('vi-VN')}đ\n`;
  }

  if (final <= 0 || paidBooks.length === 0) {
    await bot.sendMessage(msg.chat.id, `🎉 Tất cả truyện bạn chọn đều miễn phí! Đang gửi link...`);

    const freeBookIds = selected.filter(b => b.free).map(b => b.id);
    if (freeBookIds.length > 0) {
      await incrementSoldQuantity(freeBookIds);
    }

    await sendBookLinks(msg.chat.id, selected, true);
    return;
  }

  // Tạo đơn hàng
  let orderId = createOrderId();
  orders[orderId] = {
    chatId: msg.chat.id,
    books: selected,
    amount: final,
    paid: false
  };

  let content = orderId;
  let qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${final}&addInfo=${content}`;

  // Gửi giỏ hàng theo phần (giữ nguyên logic cũ)
  const ITEMS_PER_PART = 3;
  const totalParts = Math.ceil(selected.length / ITEMS_PER_PART);
  let partNumber = 1;
  let startIndex = 0;

  while (startIndex < selected.length) {
    const endIndex = Math.min(startIndex + ITEMS_PER_PART, selected.length);
    const chunk = selected.slice(startIndex, endIndex);

    let captionPart = `🛒 GIỎ HÀNG CỦA BẠN ĐÃ SẴN SÀNG! (Phần ${partNumber}/${totalParts})\n\n`;
    captionPart += `Bạn đã chọn:\n${chunk.map(b => `• ${b.id}. ${b.name}`).join("\n")}\n`;

    if (endIndex === selected.length) {
      captionPart += `\n💰 Tổng tiền gốc: ${total.toLocaleString('vi-VN')}đ\n`;
      captionPart += `🎁 Giảm giá thường: ${discount.toLocaleString('vi-VN')}đ\n`;
      captionPart += vipDiscountText;
      captionPart += `💳 Số tiền cần thanh toán: ${final.toLocaleString('vi-VN')}đ\n\n`;

      captionPart += `🧾 Mã đơn hàng: ${orderId}\n`;
      captionPart += `📝 Nội dung chuyển khoản chính xác: \`${content}\`\n\n`;
      if (isFullPurchase) captionPart += `🎉 ĐÃ ÁP DỤNG ƯU ĐÃI MUA FULL!\n`;
      if (isVIP) captionPart += `💎 Bạn đang là VIP - Đã giảm 50%!\n`;
      captionPart += `Cảm ơn bạn đã ủng hộ! ❤️`;
    }

    if (partNumber === 1) {
      await bot.sendPhoto(msg.chat.id, qrLink, { caption: captionPart, parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(msg.chat.id, captionPart, { parse_mode: 'Markdown' });
    }

    if (endIndex < selected.length) await new Promise(r => setTimeout(r, 1000));
    startIndex = endIndex;
    partNumber++;
  }

  const instructionText = `🔗 Quét mã QR ở tin nhắn đầu tiên hoặc chuyển khoản theo thông tin ngân hàng (0550767799967 MB Bank)\n` +
    `Nội dung chuyển khoản phải đúng chính xác với Mã Đơn Hàng: \`${orderId}\`.\n\n` +
    `⏳ Sau khi nhận được thanh toán, bot sẽ tự động gửi link truyện cho bạn ngay lập tức.\n\n` +
    `⚠️ Lưu ý: Khi tạo đơn mới thì mã QR của các đơn cũ bị vô hiệu.\n` +
    `Nếu gặp lỗi, nhắn @ea7bpp kèm mã đơn ${orderId} + ảnh chuyển khoản để hỗ trợ nhanh!`;

  await bot.sendMessage(msg.chat.id, instructionText, { parse_mode: 'Markdown' });
});

app.get("/ping", (req, res) => res.send("alive"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));