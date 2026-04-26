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
//   CÁC HÀM MỚI - NÂNG CẤP
// ======================

// Tính giảm giá theo hóa đơn (mua nhiều) - MỚI
function calculateMultiDiscount(total) {
  if (total < 50000) return 0;
  
  let percent = 5; // Bắt đầu từ 50k = 5%
  const extra = Math.floor((total - 50000) / 10000);
  percent += extra;
  
  if (percent > 39) percent = 39; // Tối đa 39%
  
  return Math.floor(total * percent / 100);
}

// Lấy % giảm giá sự kiện hiện tại (nếu có)
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

// Tính giá cuối cùng (LOGIC MỚI HOÀN TOÀN)
async function calculateFinalPrice(selected, isVIP, isFullPurchase) {
  const paidBooks = selected.filter(b => !b.free);
  const total = paidBooks.reduce((s, b) => s + b.price, 0);
  const count = paidBooks.length;

  let final = 0;
  let discountBreakdown = [];

  if (isFullPurchase) {
    // === MUA FULL ===
    final = 309000;
    
    if (isVIP) {
      final = 309000 - 120000; // Giảm thẳng 120k cho VIP
      discountBreakdown.push(`💎 VIP giảm 120k: -120.000đ`);
    } else {
      discountBreakdown.push(`🎁 Tặng VIP vĩnh viễn khi thanh toán!`);
    }
  } else {
    // === MUA LẺ / MUA NHIỀU ===
    // 1. Giảm theo hóa đơn (ưu tiên cao nhất)
    const multiDiscount = calculateMultiDiscount(total);
    let afterMulti = total - multiDiscount;
    
    if (multiDiscount > 0) {
      const multiPercent = Math.round((multiDiscount / total) * 100);
      discountBreakdown.push(`🎁 Giảm mua nhiều ${multiPercent}%: -${multiDiscount.toLocaleString('vi-VN')}đ`);
    }

    // 2. Giảm VIP 50%
    let afterVIP = afterMulti;
    if (isVIP && afterMulti > 0) {
      const vipDiscount = Math.floor(afterMulti / 2);
      afterVIP = afterMulti - vipDiscount;
      discountBreakdown.push(`💎 Giảm VIP 50%: -${vipDiscount.toLocaleString('vi-VN')}đ`);
    }

    // 3. Giảm sự kiện (ưu tiên cuối cùng)
    const eventPercent = await getActiveEventDiscountPercent();
    let finalAfterEvent = afterVIP;
    
    if (eventPercent > 0 && afterVIP > 0) {
      const eventDiscount = Math.floor(afterVIP * eventPercent / 100);
      finalAfterEvent = afterVIP - eventDiscount;
      discountBreakdown.push(`🎉 Giảm sự kiện ${eventPercent}%: -${eventDiscount.toLocaleString('vi-VN')}đ`);
    }

    final = finalAfterEvent;
  }

  return {
    finalAmount: Math.max(0, final),
    discountBreakdown,
    totalOriginal: total
  };
}

// Gửi link theo chunk - ĐÃ NÂNG CẤP HỖ TRỢ link_free
async function sendBookLinks(chatId, books, isFree = false, isVIP = false) {
  if (!chatId || !books || books.length === 0) return;

  const ITEMS_PER_PART = 3;
  const totalParts = Math.ceil(books.length / ITEMS_PER_PART);

  for (let i = 0; i < books.length; i += ITEMS_PER_PART) {
    const chunk = books.slice(i, i + ITEMS_PER_PART);
    const partNumber = Math.floor(i / ITEMS_PER_PART) + 1;

    const chunkLinks = chunk
      .map((b) => {
        // === LOGIC MỚI: Chọn link ===
        let linkToUse = b.link || '';
        
        // Chỉ dùng link_free khi là đơn miễn phí VÀ user KHÔNG phải VIP
        if (isFree && !isVIP && b.link_free) {
          linkToUse = b.link_free;
        }
        
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
//       WEBHOOK (GIỮ NGUYÊN)
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

  const userInfo = `${order.username || 'Không có username'} | ChatID: ${order.chatId}`;
  console.log(`✅ THANH TOÁN THÀNH CÔNG | Order: ${orderId} | User: ${userInfo} | Số tiền: ${amount.toLocaleString('vi-VN')}đ`);

  try {
    if (order.isVIP) {
      await addToVIP(order.chatId);
      await bot.sendMessage(order.chatId, 
        `🎉 THANH TOÁN VIP THÀNH CÔNG!\n\n` +
        `💎 Bạn đã trở thành VIP Member.\n` +
        `Từ nay mọi lần mua truyện sẽ được giảm thêm 50%.\n\n` +
        `Cảm ơn bạn đã ủng hộ Truyện Ếch Xanh! 🔥`
      );
      console.log(`✅ ĐÃ CẤP VIP cho ${userInfo}`);
    } else {
      const bookIds = order.books.map(b => b.id);
      await incrementSoldQuantity(bookIds);
      
      // === GỬI LINK VỚI isVIP ===
      const isVIPUser = await isUserVIP(order.chatId);
      await sendBookLinks(order.chatId, order.books, false, isVIPUser);
      console.log(`✅ ĐÃ GỬI LINK TRUYỆN cho ${userInfo}`);
    }
  } catch (err) {
    console.error(`❌ LỖI XỬ LÝ ĐƠN ${orderId} | User: ${userInfo} | Error:`, err.message);
    
    if (order.chatId) {
      await bot.sendMessage(order.chatId, 
        `✅ Thanh toán đã thành công nhưng có lỗi hệ thống.\n` +
        `Nhắn @ea7bpp kèm mã đơn \`${orderId}\` để được hỗ trợ ngay!`
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

// ======================
//   GLOBAL ERROR HANDLER
// ======================
bot.on('error', (err) => console.error('❌ Bot error:', err.message));
bot.on('polling_error', (err) => console.error('❌ Polling error:', err.message));

// ======================
//       BOT LOGIC (GIỮ NGUYÊN PHẦN PHÂN TRANG)
// ======================

function getPageNumberButtons(currentPage, totalPages) {
  const buttons = [];

  buttons.push({
    text: '⏪',
    callback_data: currentPage === 1 ? 'noop:first' : 'list_page:1'
  });

  let startPage = Math.max(1, currentPage - 1);
  let endPage = Math.min(totalPages, currentPage + 1);

  if (endPage - startPage < 2) {
    if (startPage === 1) {
      endPage = Math.min(totalPages, 3);
    } else if (endPage === totalPages) {
      startPage = Math.max(1, totalPages - 2);
    }
  }

  for (let p = startPage; p <= endPage; p++) {
    if (p === currentPage) {
      buttons.push({ text: `【${p}】`, callback_data: 'noop' });
    } else {
      buttons.push({ text: `${p}`, callback_data: `list_page:${p}` });
    }
  }

  buttons.push({
    text: '⏩',
    callback_data: currentPage === totalPages ? 'noop:last' : `list_page:${totalPages}`
  });

  return [buttons];
}

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

    if (chatId) {
      const isVIP = await isUserVIP(chatId);
      if (isVIP) {
        text += `🎟️ BẠN ĐANG LÀ VIP MEMBER → Giảm 50% vĩnh viễn + ưu đãi mua nhiều\n\n`;
      } else {
        text += `💎 VIP Member - Chỉ 139.000đ (một lần mua):\n`;
        text += `• Giảm 50% vĩnh viễn trên mọi đơn hàng\n`;
        text += `• Mua Full chỉ 309k (tặng VIP)\n\n`;
      }
    }

    chunk.forEach(b => {
      text += `-----------------------------\n\n`;
      text += `${b.id}. ${b.name}\n`;
      text += `   📖 Số chương: ${b.chapters}\n`;
      text += `   📏 Độ dài: ${b.chapterLength}\n`;
      text += `   🎭 Thể loại: ${b.genres.join(", ")}\n`;
      text += `   📝 Nội dung: ${b.description}\n`;
      text += `   💰 Giá: ${b.free ? "Free" : b.price.toLocaleString('vi-VN') + "đ"}\n\n`;
    });

    text += `✍ Nhập số tương ứng với truyện bạn muốn mua (cách nhau bằng dấu cách nếu mua nhiều).\n`;
    text += `Ví dụ: \`1 3 5\`\nHoặc gõ \`full\` để mua toàn bộ truyện!`;

    let inlineKeyboard = [];
    if (totalPages > 1) {
      inlineKeyboard = getPageNumberButtons(page, totalPages);
    }

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
//   START COMMAND (ĐÃ CẬP NHẬT TEXT)
// ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const isVIP = await isUserVIP(chatId);

  let welcomeText = `🐸 Chào mừng bạn đến với Truyện Ếch Xanh\n\n`;

  if (isVIP) {
    welcomeText += `🎟️ BẠN ĐANG LÀ VIP MEMBER\n`;
    welcomeText += `💎 Giảm 50% vĩnh viễn + ưu đãi mua nhiều theo %\n`;
    welcomeText += `🎁 Mua Full chỉ còn 189k (giảm thẳng 120k)\n\n`;
  } else {
    welcomeText += `💎 VIP Member - Chỉ 139.000đ (một lần mua):\n`;
    welcomeText += `• Giảm 50% vĩnh viễn trên mọi đơn hàng\n`;
    welcomeText += `• Mua Full chỉ 309k (tặng VIP vĩnh viễn)\n\n`;
  }

  welcomeText += `Ưu đãi mua nhiều MỚI (giảm theo % hóa đơn):\n`;
  welcomeText += `• Từ 50k → giảm 5%, cứ +10k thêm 1%\n`;
  welcomeText += `• Tối đa 39%\n\n`;

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

// Callback Query (GIỮ NGUYÊN)
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

      const vipPrice = 139000;
      const orderId = createOrderId();

      const username = callbackQuery.from.username 
        ? `@${callbackQuery.from.username}` 
        : callbackQuery.from.first_name || 'Không có username';

      orders[orderId] = {
        chatId: chatId,
        username: username,
        isVIP: true,
        amount: vipPrice,
        paid: false
      };

      const content = orderId;
      const qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${vipPrice}&addInfo=${content}`;

      const caption = `💎 MUA VIP MEMBER - 139.000đ\n\n` +
        `Sau khi thanh toán bạn sẽ được:\n` +
        `• Giảm 50% vĩnh viễn trên mọi đơn hàng\n` +
        `• Mua Full chỉ còn 189k (giảm thẳng 120k)\n\n` +
        `🧾 Mã đơn hàng: \`${orderId}\`\n` +
        `📝 Nội dung chuyển khoản: \`${content}\`\n\n` +
        `Quét mã QR hoặc chuyển khoản MB Bank 0550767799967\n` +
        `Bot sẽ tự động xác nhận ngay khi nhận tiền!`;

      await bot.sendPhoto(chatId, qrLink, { 
        caption, 
        parse_mode: 'Markdown' 
      });

      console.log(`📋 TẠO ĐƠN VIP | Order: ${orderId} | User: ${username} | ChatID: ${chatId}`);
    } catch (err) {
      console.error('❌ LỖI BUY VIP:', err.message);
      await bot.sendMessage(chatId, 
        `❌ Có lỗi khi tạo đơn VIP.\n` +
        `Vui lòng thử lại hoặc nhắn @ea7bpp kèm lỗi này để mình fix ngay!`
      ).catch(() => {});
    }
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
  
  // === TÍNH GIÁ MỚI ===
  const { finalAmount, discountBreakdown, totalOriginal } = await calculateFinalPrice(selected, isVIP, isFullPurchase);

  // Kiểm tra miễn phí
  if (finalAmount <= 0 || selected.every(b => b.free)) {
    await bot.sendMessage(msg.chat.id, `🎉 Tất cả truyện bạn chọn đều miễn phí! Đang gửi link...`);

    const freeBookIds = selected.filter(b => b.free).map(b => b.id);
    if (freeBookIds.length > 0) {
      await incrementSoldQuantity(freeBookIds);
    }

    await sendBookLinks(msg.chat.id, selected, true, isVIP);
    return;
  }

  // Tạo đơn hàng
  let orderId = createOrderId();

  const username = msg.from.username 
    ? `@${msg.from.username}` 
    : msg.from.first_name || 'Không có username';

  orders[orderId] = {
    chatId: msg.chat.id,
    username: username,
    books: selected,
    amount: finalAmount,
    paid: false
  };

  console.log(`📋 TẠO ĐƠN TRUYỆN | Order: ${orderId} | User: ${username} | ChatID: ${msg.chat.id} | Số tiền: ${finalAmount.toLocaleString('vi-VN')}đ`);

  let content = orderId;
  let qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${finalAmount}&addInfo=${content}`;

  // Gửi giỏ hàng theo phần
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
      captionPart += `\n💰 Tổng tiền gốc: ${totalOriginal.toLocaleString('vi-VN')}đ\n`;
      
      discountBreakdown.forEach(line => {
        captionPart += `${line}\n`;
      });
      
      captionPart += `💳 Số tiền cần thanh toán: ${finalAmount.toLocaleString('vi-VN')}đ\n\n`;

      captionPart += `🧾 Mã đơn hàng: ${orderId}\n`;
      captionPart += `📝 Nội dung chuyển khoản chính xác: \`${content}\`\n\n`;
      
      if (isFullPurchase) {
        captionPart += `🎉 ĐÃ ÁP DỤNG GIÁ FULL 309K!\n`;
        if (isVIP) {
          captionPart += `💎 VIP được giảm thẳng 120k!\n`;
        } else {
          captionPart += `🎁 Tặng VIP vĩnh viễn!\n`;
        }
      }
      
      if (isVIP && !isFullPurchase) {
        captionPart += `💎 Bạn đang là VIP - Đã giảm 50%!\n`;
      }
      
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