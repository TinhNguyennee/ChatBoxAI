const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const express = require("express");
const bodyParser = require("body-parser");

// TOKEN từ env
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });


// ======================
//   GLOBAL ERROR HANDLER (RẤT QUAN TRỌNG)
// ======================
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});


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
//   CÁC HÀM CŨ (GIỮ NGUYÊN)
// ======================

// Kiểm tra user có phải VIP không
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
    console.log(`📈 Đã +1 sold_quantity cho ${bookIds.length} truyện (IDs: ${bookIds.join(', ')})`);
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
      link_free: row.link_free || '',   // MỚI
      genres: row.genres ? row.genres.split(', ') : []
    }));
  } catch (err) {
    console.error('❌ Lỗi query books:', err.message);
    return [];
  }
}

// ======================
//   CÁC HÀM MỚI - NÂNG CẤP
// ======================

// Lấy % giảm giá sự kiện hiện tại
async function getActiveEventDiscountPercent() {
  try {
    const res = await pool.query(
      'SELECT percent FROM discount_events WHERE active = true LIMIT 1'
    );
    return res.rows.length > 0 ? parseInt(res.rows[0].percent) || 0 : 0;
  } catch (err) {
    console.error('❌ Lỗi lấy event discount:', err.message);
    return 0;
  }
}

// Lấy thông tin event active (content + percent) - MỚI cho banner
async function getActiveEvent() {
  try {
    const res = await pool.query(
      'SELECT content, percent FROM discount_events WHERE active = true LIMIT 1'
    );
    if (res.rows.length > 0) {
      return {
        content: res.rows[0].content || '',
        percent: parseInt(res.rows[0].percent) || 0
      };
    }
    return null;
  } catch (err) {
    console.error('❌ Lỗi lấy active event:', err.message);
    return null;
  }
}

// Tính giá cuối cùng (cộng dồn % , multi max 39%, tổng max 75%)
async function calculateFinalPrice(selected, isVIP, isFullPurchase) {
  const paidBooks = selected.filter(b => !b.free);
  const total = paidBooks.reduce((s, b) => s + b.price, 0);

  let final = 0;
  let discountBreakdown = [];
  const eventPercent = await getActiveEventDiscountPercent();

  if (isFullPurchase) {
    let basePrice = 309000;
    if (isVIP) {
      basePrice = 189000;
      discountBreakdown.push(`💎 VIP đã áp dụng giá: 189.000đ`);
    } else {
      discountBreakdown.push(`🎉 Áp dụng giá mua full: 309.000đ`);
    }
    final = basePrice;
    if (eventPercent > 0) {
      const d = Math.floor(basePrice * eventPercent / 100);
      final -= d;
      discountBreakdown.push(`🎉 Giảm sự kiện ${eventPercent}% (-${d.toLocaleString('vi-VN')}đ)`);
    }
  } else {
    let multiP = 0;
    if (total >= 50000) {
      multiP = 5 + Math.floor((total - 50000) / 10000);
      if (multiP > 39) multiP = 39;
    }
    const vipP = isVIP ? 50 : 0;
    let totP = multiP + vipP + eventPercent;
    if (totP > 75) totP = 75;

    final = Math.floor(total * (100 - totP) / 100);
    const saved = total - final;

    if (multiP > 0) discountBreakdown.push(`🎁 Giảm mua nhiều ${multiP}%`);
    if (vipP > 0) discountBreakdown.push(`💎 Giảm VIP 50%`);
    if (eventPercent > 0) discountBreakdown.push(`🎉 Giảm sự kiện ${eventPercent}%`);
    if (totP > 0) discountBreakdown.push(`✅ Tổng ưu đãi của bạn: ${totP}% (-${saved.toLocaleString('vi-VN')}đ)`);
  }

  return { finalAmount: Math.max(0, final), discountBreakdown, totalOriginal: total };
}

// Gửi link theo chunk (luôn dùng link thường, đã bỏ link_free)
async function sendBookLinks(chatId, books, isFree = false, isVIP = false) {
  if (!chatId || !books || books.length === 0) return;

  const ITEMS_PER_PART = 3;
  const totalParts = Math.ceil(books.length / ITEMS_PER_PART);

  for (let i = 0; i < books.length; i += ITEMS_PER_PART) {
    const chunk = books.slice(i, i + ITEMS_PER_PART);
    const partNumber = Math.floor(i / ITEMS_PER_PART) + 1;

    const chunkLinks = chunk
      .map((b) => {
        let linkToUse = b.link || '';
        if (!linkToUse) return `${b.id}. ${b.name}\n(LINK KHÔNG CÓ)`;
        
        let linkParts = linkToUse.split(', ').map(p => p.trim());
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
        text += `✅ THANH TOÁN THÀNH CÔNG!\n\nCảm ơn bạn đã ủng hộ! Truyện đã mở khóa.\n\n`;
        text += `Hướng dẫn đọc trên điện thoại:\nhttps://docs.google.com/document/d/1HYw_H1AzUoQwZudRZg3da4VlzMK7PEf-ey5jD2syMCY/edit?usp=sharing\n\n`;
      }
      text += `Truyện của bạn:\n${chunkLinks}\n\n`;
    } else {
      text += `✅ Tiếp tục danh sách (Phần ${partNumber}/${totalParts})\n\nTruyện của bạn:\n${chunkLinks}\n\n`;
    }

    if (partNumber < totalParts) {
      text += `(Còn phần sau...)\n\n`;
    } else {
      text += `Mẹo: Dùng app Google Docs để đọc mượt. Có vấn đề gì nhắn @ea7bpp nhé!\nChúc đọc vui! 🔥`;
    }

    await bot.sendMessage(chatId, text);
    if (partNumber < totalParts) await new Promise(r => setTimeout(r, 1500));
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
  if (!orderId) return res.send("ok");

  let order = orders[orderId];
  if (!order || order.paid) return res.send("ok");
  if (order.amount !== amount) return res.send("ok");

  order.paid = true;
  const userInfo = `${order.username || 'Không có username'} | ChatID: ${order.chatId}`;
  console.log(`✅ THANH TOÁN THÀNH CÔNG | Order: ${orderId} | User: ${userInfo} | Số tiền: ${amount.toLocaleString('vi-VN')}đ`);

try {
  if (order.isVIP) {
    await addToVIP(order.chatId);
    await bot.sendMessage(order.chatId, 
      `🎉 THANH TOÁN VIP THÀNH CÔNG!\n\n💎 Bạn đã trở thành VIP Member.\nTừ nay mọi lần mua truyện sẽ được giảm thêm 50%.\n\nCảm ơn bạn đã ủng hộ Truyện Ếch Xanh! 🔥`
    );
  } 
  else if (order.isFullPurchase) {
    // ==================== XỬ LÝ MUA FULL ====================
    const bookIds = order.books.map(b => b.id);
    await incrementSoldQuantity(bookIds);

    const isAlreadyVIP = await isUserVIP(order.chatId);

    if (!isAlreadyVIP) {
      await addToVIP(order.chatId);
      await bot.sendMessage(order.chatId, 
        `🎉 CẢM ƠN BẠN ĐÃ MUA FULL TRUYỆN!\n\n💎 Bạn đã được **tặng VIP Member vĩnh viễn**!\nTừ nay mọi đơn hàng sẽ được giảm 50%.\n\nLink truyện sẽ được gửi ngay bên dưới.`
      );
    } else {
      await bot.sendMessage(order.chatId, 
        `✅ THANH TOÁN FULL THÀNH CÔNG!\n\nBạn đã là VIP Member rồi nên không cần tặng thêm.\nLink truyện sẽ được gửi ngay bên dưới.`
      );
    }

    const isVIPUser = await isUserVIP(order.chatId);
    await sendBookLinks(order.chatId, order.books, false, isVIPUser);

  } 
  else {
    // ==================== ĐƠN MUA LẺ (bình thường) ====================
    const bookIds = order.books.map(b => b.id);
    await incrementSoldQuantity(bookIds);
    const isVIPUser = await isUserVIP(order.chatId);
    await sendBookLinks(order.chatId, order.books, false, isVIPUser);
  }
} catch (err) {
  console.error(`❌ LỖI XỬ LÝ ĐƠN ${orderId} | User: ${userInfo} | Error:`, err.message);
  if (order.chatId) {
    await bot.sendMessage(order.chatId, 
      `✅ Thanh toán đã thành công nhưng có lỗi hệ thống.\nNhắn @ea7bpp kèm mã đơn \`${orderId}\` để được hỗ trợ ngay!`
    ).catch(() => {});
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

bot.on('error', (err) => console.error('❌ Bot error:', err.message));
bot.on('polling_error', (err) => console.error('❌ Polling error:', err.message));

// ======================
//       BOT LOGIC
// ======================

function getPageNumberButtons(currentPage, totalPages) {
  const buttons = [];
  buttons.push({ text: '⏪', callback_data: currentPage === 1 ? 'noop:first' : 'list_page:1' });

  let startPage = Math.max(1, currentPage - 1);
  let endPage = Math.min(totalPages, currentPage + 1);
  if (endPage - startPage < 2) {
    if (startPage === 1) endPage = Math.min(totalPages, 3);
    else if (endPage === totalPages) startPage = Math.max(1, totalPages - 2);
  }

  for (let p = startPage; p <= endPage; p++) {
    if (p === currentPage) {
      buttons.push({ text: `【${p}】`, callback_data: 'noop' });
    } else {
      buttons.push({ text: `${p}`, callback_data: `list_page:${p}` });
    }
  }

  buttons.push({ text: '⏩', callback_data: currentPage === totalPages ? 'noop:last' : `list_page:${totalPages}` });
  return [buttons];
}

async function generateListPage(page = 1, chatId = null) {
  try {
    let books = await getBooks();
    if (books.length === 0) {
      return { text: 'Hiện chưa có truyện nào trong database 😢.', inlineKeyboard: [] };
    }

    books.sort((a, b) => b.id - a.id);
    const ITEMS_PER_MESSAGE = 3;
    const totalPages = Math.ceil(books.length / ITEMS_PER_MESSAGE);
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * ITEMS_PER_MESSAGE;
    const chunk = books.slice(start, start + ITEMS_PER_MESSAGE);

    let text = `📚 Danh sách truyện (Trang ${page}/${totalPages})\n\n`;

    if (chatId) {
      const isVIP = await isUserVIP(chatId);
      if (isVIP) {
        text += `🎟️ BẠN ĐANG LÀ VIP MEMBER\n• Giảm 50% vĩnh viễn\n• Mua Full áp dụng giá 189k\n\n`;
      } else {
        text += `💎 VIP Member - Chỉ 139.000đ:\n• Giảm 50% vĩnh viễn\n• Mua VIP Member ngay tại /start\n\n`;
        text += `🛒 Mua Full truyện - chỉ 309.000đ:\n• Tặng VIP Member\n\n`;
      }
    }

    // Hiển thị banner event nếu active (ẩn nếu FALSE)
    const activeEvent = await getActiveEvent();
    if (activeEvent && activeEvent.content) {
      text += `${activeEvent.content}\n💥 Giảm thêm ${activeEvent.percent}% cho tất cả đơn hàng!\n\n`;
    }

    chunk.forEach(b => {
      text += `-----------------------------\n\n${b.id}. ${b.name}\n   📖 Số chương: ${b.chapters}\n   📏 Độ dài: ${b.chapterLength}\n   🎭 Thể loại: ${b.genres.join(", ")}\n   📝 Nội dung: ${b.description}\n   💰 Giá: ${b.free ? "Free" : b.price.toLocaleString('vi-VN') + "đ"}\n\n`;
    });

    text += `✍ Nhập số tương ứng với truyện bạn muốn mua (cách nhau bằng dấu cách nếu mua nhiều).\nVí dụ: \`1 15 24 31\`\nHoặc gõ \`full\` để mua toàn bộ truyện!`;

    let inlineKeyboard = [];
    if (totalPages > 1) inlineKeyboard = getPageNumberButtons(page, totalPages);

    return { text, inlineKeyboard };
  } catch (err) {
    console.error("❌ Lỗi generateListPage:", err.message);
    return { text: 'Có lỗi khi tải danh sách truyện 😵.', inlineKeyboard: [] };
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
    welcomeText += `🎟️ BẠN ĐANG LÀ VIP MEMBER\n💎 Giảm 50% tổng hóa đơn (Không áp dụng mua Full, mua Full sẽ được áp dụng giá khác)\n🎁 Áp dụng mua Full còn 189k\n\n`;
  } else {
    welcomeText += `💎 VIP Member - Chỉ 139.000đ (vĩnh viễn):\n• Giảm 50% tổng hóa đơn (Không áp dụng mua Full, mua Full sẽ được áp dụng giá khác)\n\n🛒 Mua Full truyện - chỉ 309.000đ:\n• Tặng VIP Member\n\n`;
  }

  welcomeText += `🎊 Ưu đãi mua truyện:\n• Hóa đơn mua truyện từ 50k → giảm 5%, cứ +10k thêm 1%\n• Tối đa 39%`;
  welcomeText += `\n\n✨ Tổng ưu đãi có thể cộng dồn tối đa lên đến 75% (kể cả VIP + sự kiện) - Giá đã được tính tự động khi tạo đơn hàng.`;

  // Hiển thị banner event nếu active
  const activeEvent = await getActiveEvent();
  if (activeEvent && activeEvent.content) {
    welcomeText += `\n\n${activeEvent.content}`;
  }

  welcomeText += `\n\nChọn ngay bên dưới nhé! 🔥`;

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
  const text = `🆔 **Telegram ID của bạn là:**\n\n\`${chatId}\`\n\n📌 Username: ${username}\n\n`;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// Callback Query
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  if (data === 'buy_vip') {
    try {
      const alreadyVIP = await isUserVIP(chatId);
      if (alreadyVIP) {
        await bot.sendMessage(chatId, '🎟️ Bạn đã là VIP Member rồi! Không cần mua lại nhé.');
        return;
      }

      const eventPercent = await getActiveEventDiscountPercent();
      let vipPrice = 139000;
      let vipDiscountLines = [];
      if (eventPercent > 0) {
        const eventDiscount = Math.floor(vipPrice * eventPercent / 100);
        vipPrice = vipPrice - eventDiscount;
        vipDiscountLines.push(`🎉 Giảm sự kiện ${eventPercent}%: -${eventDiscount.toLocaleString('vi-VN')}đ`);
      }

      const orderId = createOrderId();
      const username = callbackQuery.from.username ? `@${callbackQuery.from.username}` : callbackQuery.from.first_name || 'Không có username';

      orders[orderId] = { chatId, username, isVIP: true, amount: vipPrice, paid: false };

      const content = orderId;
      const qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${vipPrice}&addInfo=${content}`;

      let caption = `💎 MUA VIP MEMBER (vĩnh viễn)`;
      if (eventPercent > 0) caption += ` (ĐÃ GIẢM ${eventPercent}% LỄ)`;
      caption += ` - ${vipPrice.toLocaleString('vi-VN')}đ\n\n`;
      if (vipDiscountLines.length > 0) {
        caption += vipDiscountLines.join('\n') + '\n\n';
      }
      caption += `Quyền lợi của VIP Member:\n• Giảm 50% mọi hóa đơn sau này\n• Mua Full áp dụng giá 189k\n\n🧾 Mã đơn hàng: \`${orderId}\`\n📝 Nội dung chuyển khoản: \`${content}\`\n\nQuét mã QR hoặc chuyển khoản MB Bank 0550767799967\nBot sẽ tự động xác nhận ngay khi nhận tiền!`;

      await bot.sendPhoto(chatId, qrLink, { caption, parse_mode: 'Markdown' });
      console.log(`📋 TẠO ĐƠN VIP | Order: ${orderId} | User: ${username} | ChatID: ${chatId} | Giá: ${vipPrice.toLocaleString('vi-VN')}đ`);
    } catch (err) {
      console.error('❌ LỖI BUY VIP:', err.message);
      await bot.sendMessage(chatId, `❌ Có lỗi khi tạo đơn VIP.\nVui lòng thử lại hoặc nhắn @ea7bpp kèm lỗi này để mình fix ngay!`).catch(() => {});
    }
    return;
  }

  if (data === 'already_vip') {
    await bot.sendMessage(chatId, '✅ Bạn đã là VIP Member rồi!');
    return;
  }

  if (data === 'show_list') {
    const { text, inlineKeyboard } = await generateListPage(1, chatId);
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard } });
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

// ======================
//   XỬ LÝ TIN NHẮN CHỌN TRUYỆN (LOGIC MỚI)
// ======================
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

  const isVIP = await isUserVIP(msg.chat.id);
  const { finalAmount, discountBreakdown, totalOriginal } = await calculateFinalPrice(selected, isVIP, isFullPurchase);

  if (finalAmount <= 0 || selected.every(b => b.free)) {
    const freeMsg = `🎉 TẤT CẢ TRUYỆN BẠN CHỌN ĐỀU MIỄN PHÍ!\n\nLink sẽ được gửi ngay cho bạn.\nCảm ơn bạn đã ủng hộ Truyện Ếch Xanh! 🔥`;
    await bot.sendMessage(msg.chat.id, freeMsg);
    const freeBookIds = selected.filter(b => b.free).map(b => b.id);
    if (freeBookIds.length > 0) await incrementSoldQuantity(freeBookIds);
    await sendBookLinks(msg.chat.id, selected, true, isVIP);
    return;
  }

  let orderId = createOrderId();
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || 'Không có username';

  orders[orderId] = {
    chatId: msg.chat.id,
    username: username,
    books: selected,
    amount: finalAmount,
    paid: false,
    isFullPurchase: isFullPurchase
  };

  // Log chi tiết truyện (chỉ cho đơn truyện, không log full)
  if (!isFullPurchase) {
    const bookNames = selected.map(b => `${b.id}`).join(' | ');
    console.log(`📋 TẠO ĐƠN TRUYỆN | Order: ${orderId} | User: ${username} | ChatID: ${msg.chat.id} | Số tiền: ${finalAmount.toLocaleString('vi-VN')}đ | Truyện: ${bookNames}`);
  } else {
    console.log(`📋 TẠO ĐƠN FULL | Order: ${orderId} | User: ${username} | ChatID: ${msg.chat.id} | Số tiền: ${finalAmount.toLocaleString('vi-VN')}đ`);
  }

  let content = orderId;
  let qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${finalAmount}&addInfo=${content}`;

  if (isFullPurchase) {
    // CHỈ HIỂN THỊ TÓM TẮT, KHÔNG LIỆT KÊ HẾT TRUYỆN
    let caption = `🛒 MUA FULL TRUYỆN - TOÀN BỘ DANH SÁCH\n\n`;
    caption += `💰 Tổng tiền gốc: ${totalOriginal.toLocaleString('vi-VN')}đ\n`;
    discountBreakdown.forEach(line => caption += `${line}\n`);
    caption += `💳 Số tiền cần thanh toán: ${finalAmount.toLocaleString('vi-VN')}đ\n`;
// ==================== CHỈ HIỆN DÒNG TẶNG VIP NẾU CHƯA LÀ VIP ====================
  if (!isVIP) {
    caption += `✨ Tặng VIP Member vĩnh viễn (giảm 50% mọi đơn hàng sau này)\n\n`;
  }
  // ========================================================================
    caption += `🧾 Mã đơn hàng: ${orderId}\n📝 Nội dung chuyển khoản chính xác: \`${content}\`\n\n`;
    caption += `Cảm ơn bạn đã ủng hộ! ❤️`;

    await bot.sendPhoto(msg.chat.id, qrLink, { caption, parse_mode: 'Markdown' });
  } else {
    const ITEMS_PER_PART = 3;
    const totalParts = Math.ceil(selected.length / ITEMS_PER_PART);
    let partNumber = 1;
    let startIndex = 0;

    while (startIndex < selected.length) {
      const endIndex = Math.min(startIndex + ITEMS_PER_PART, selected.length);
      const chunk = selected.slice(startIndex, endIndex);

      let captionPart = `🛒 GIỎ HÀNG CỦA BẠN ĐÃ SẴN SÀNG! (Phần ${partNumber}/${totalParts})\n\nBạn đã chọn:\n${chunk.map(b => `• ${b.id}. ${b.name}`).join("\n")}\n`;

      if (endIndex === selected.length) {
        captionPart += `\n💰 Tổng tiền gốc: ${totalOriginal.toLocaleString('vi-VN')}đ\n`;
        discountBreakdown.forEach(line => captionPart += `${line}\n`);
        captionPart += `💳 Số tiền cần thanh toán: ${finalAmount.toLocaleString('vi-VN')}đ\n\n`;
        captionPart += `🧾 Mã đơn hàng: ${orderId}\n📝 Nội dung chuyển khoản chính xác: \`${content}\`\n\n`;
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
  }

  const instructionText = `🔗 Quét mã QR ở tin nhắn trên hoặc chuyển khoản theo thông tin ngân hàng (0550767799967 MB Bank)\nNội dung chuyển khoản phải đúng chính xác với Mã Đơn Hàng: \`${orderId}\`.\n\n⏳ Sau khi nhận được thanh toán, bot sẽ tự động gửi link truyện cho bạn ngay lập tức.\n\n⚠️ Lưu ý: Khi tạo đơn mới thì mã QR của các đơn cũ bị vô hiệu.\nNếu gặp lỗi, nhắn @ea7bpp kèm mã đơn ${orderId} + ảnh chuyển khoản để hỗ trợ nhanh!`;

  await bot.sendMessage(msg.chat.id, instructionText, { parse_mode: 'Markdown' });
});

app.get("/ping", (req, res) => res.send("alive"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));