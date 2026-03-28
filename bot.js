const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const express = require("express");
const bodyParser = require("body-parser");

// TOKEN từ env
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token);

// Kết nối Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }  // Bắt buộc với Neon
});

// Khởi tạo Express app ngay từ đầu
const app = express();
app.use(bodyParser.json());

// Nơi lưu đơn hàng tạm thời (trong RAM)
const orders = {};

// Tạo mã đơn
function createOrderId() {
  return "OD" + Math.floor(Math.random() * 1000000);
}

// Test kết nối lúc start server
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Lỗi kết nối Neon DB:', err.stack);
  } else {
    console.log('✅ Kết nối Neon PostgreSQL thành công!');
    release();
  }
});

// Hàm lấy danh sách truyện từ DB (async)
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
      link: row.link || '',           // field link để gửi sau
      genres: row.genres ? row.genres.split(', ') : []
    }));
  } catch (err) {
    console.error('❌ Lỗi query books:', err.stack);
    return [];  // trả về mảng rỗng nếu lỗi
  }
}

// === HÀM MỚI: GỬI LINK THEO CHUNK 3 TRUYỆN (DÙNG CHO FREE VÀ SUCCESS) ===
async function sendBookLinks(chatId, books, isFree = false) {
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

// Webhook Sepay (đã cập nhật dùng hàm mới)
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
  console.log(`✅ Thanh toán OK đơn ${orderId} - ${order.books.length} bộ`);

  try {
    await sendBookLinks(order.chatId, order.books, false);   // false = thanh toán thành công
    console.log(`Hoàn tất gửi link đơn ${orderId}`);
  } catch (err) {
    console.error(`LỖI GỬI LINK ĐƠN ${orderId}:`, err.message || err.stack);
    await bot.sendMessage(order.chatId, 
      `✅ Thanh toán OK nhưng lỗi gửi link.\n` +
      `Nhắn @ea7bpp kèm mã đơn ${orderId} để hỗ trợ ngay nhé!`);
  }

  delete orders[orderId];
  res.send("ok");
});

// Webhook Telegram
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Set webhook cho Telegram (chạy 1 lần khi server start)
const url = "https://chatboxai-eoul.onrender.com";  // <-- thay bằng domain thật của Render nếu khác
bot.setWebHook(`${url}/bot${token}`)
  .then(() => console.log('Webhook Telegram đã được set thành công'))
  .catch(err => console.error('Lỗi set webhook Telegram:', err));

// ======================
//       BOT LOGIC
// ======================

// Phân trang danh sách (giữ nguyên logic cũ, chỉ bổ sung text hướng dẫn mua full)
async function generateListPage(page = 1) {
  try {
    let books = await getBooks();

    if (books.length === 0) {
      return {
        text: 'Hiện chưa có truyện nào trong database 😢. Liên hệ @ea7bpp để kiểm tra nhé!',
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

    chunk.forEach(b => {
      text += `-----------------------------\n\n`;
      text += `${b.id}. ${b.name}\n`;
      text += `   📖 Số chương: ${b.chapters}\n`;
      text += `   📏 Độ dài: ${b.chapterLength}\n`;
      text += `   🎭 Thể loại: ${b.genres.join(", ")}\n`;
      text += `   📝 Nội dung: ${b.description}\n`;
      text += `   💰 Giá: ${b.free ? "Free" : b.price.toLocaleString('vi-VN') + "đ"}\n\n`;
    });

    text += `✍ Nhập số tương ứng với truyện bạn muốn mua (cách nhau bằng dấu cách nếu mua nhiều).\n\n`;
    text += `Ví dụ: 1 3 5\nHoặc gõ \`full\` / \`mua full\` để mua toàn bộ truyện có phí!`;

    const inlineKeyboard = [];

    const firstRow = [];
    if (page > 1) {
      firstRow.push({ text: '⏪ Trang đầu', callback_data: `list_page:1` });
      firstRow.push({ text: '◀️ Trang trước', callback_data: `list_page:${page - 1}` });
    }
    if (firstRow.length > 0) inlineKeyboard.push(firstRow);

    let pageRow = [];
    for (let p = 1; p <= totalPages; p++) {
      const btnText = (p === page) ? `【${p}】` : `${p}`;
      pageRow.push({ text: btnText, callback_data: `list_page:${p}` });

      if (pageRow.length === 5 || p === totalPages) {
        inlineKeyboard.push(pageRow);
        pageRow = [];
      }
    }

    const lastRow = [];
    if (page < totalPages) {
      lastRow.push({ text: '▶️ Trang sau', callback_data: `list_page:${page + 1}` });
      lastRow.push({ text: 'Trang cuối ⏩', callback_data: `list_page:${totalPages}` });
    }
    if (lastRow.length > 0) inlineKeyboard.push(lastRow);

    return { text, inlineKeyboard };
  } catch (err) {
    console.error("Lỗi generateListPage:", err);
    return {
      text: 'Có lỗi khi tải danh sách truyện 😵. Thử lại sau hoặc liên hệ @ea7bpp nhé!',
      inlineKeyboard: []
    };
  }
}

// START (đã thay bằng nút inline)
bot.onText(/\/start/, async (msg) => {
  const welcomeText = `🐸 Chào mừng đến với Truyện Ếch Xanh

- Chat Box này dùng để xem list truyện, giá và mua truyện trực tiếp qua bot.

🤤 ƯU ĐÃI KHI MUA NHIỀU TRUYỆN:
• Mua từ bộ thứ 3 sẽ được giảm 20k
• Mua từ bộ thứ 4 trở đi sẽ được giảm thêm 10k mỗi bộ
• Mua FULL giảm thêm 5k mỗi truyện

Nhấn nút bên dưới để xem danh sách truyện`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "📚 Xem Danh Sách Truyện", callback_data: "show_list" }]
    ]
  };

  await bot.sendMessage(msg.chat.id, welcomeText, { reply_markup: keyboard });
});

// Giữ /list để tương thích cũ
bot.onText(/\/list/, async (msg) => {
  console.log("Hàm /list đã được gọi");

  try {
    const { text, inlineKeyboard } = await generateListPage(1);

    await bot.sendMessage(msg.chat.id, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

    console.log(`Đã gửi trang 1 danh sách truyện cho user ${msg.chat.id}`);
  } catch (err) {
    console.error("Lỗi khi gửi /list:", err.message || err);
    await bot.sendMessage(msg.chat.id, 'Có lỗi khi tải danh sách truyện 😵. Thử lại sau hoặc liên hệ @ea7bpp nhé!');
  }
});

// Callback query (thêm xử lý nút show_list)
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;

  // Xử lý nút "Xem Danh Sách Truyện"
  if (data === 'show_list') {
    try {
      const chatId = callbackQuery.message.chat.id;
      const { text, inlineKeyboard } = await generateListPage(1);

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (err) {
      console.error("Lỗi show_list:", err);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Có lỗi!' });
    }
    return;
  }

  // Xử lý phân trang cũ
  if (!data.startsWith('list_page:')) return;

  const requestedPage = parseInt(data.split(':')[1]);
  if (isNaN(requestedPage)) return;

  try {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    const { text, inlineKeyboard } = await generateListPage(requestedPage);

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (err) {
    console.error("Lỗi khi chuyển trang list:", err.message || err);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Có lỗi khi chuyển trang!' });
  }
});

// XỬ LÝ CHỌN TRUYỆN (đã thêm mua full + free tách chunk)
bot.on("message", async (msg) => {
  let text = msg.text;
  if (!text) return;

  if (text.startsWith('/')) return;

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
  let selected;
  if (isFullPurchase) {
    selected = allBooks;                     // toàn bộ truyện (free + có phí)
  } else {
    selected = allBooks.filter(b => ids.includes(b.id));
  }

  if (selected.length === 0) {
    return bot.sendMessage(msg.chat.id, 'Không tìm thấy truyện nào với số bạn nhập 😕. Hãy thử lại nhé!');
  }

  let paidBooks = selected.filter(b => !b.free);
  let total = paidBooks.reduce((s, b) => s + b.price, 0);
  let count = paidBooks.length;

  let discount = 0;
  if (count >= 3) discount += 20000;
  if (count >= 4) discount += (count - 3) * 10000;

  if (isFullPurchase && count > 0) {
    discount += count * 5000;   // giảm thêm 5k mỗi truyện khi mua full
  }

  let final = total - discount;

  // === TRƯỜNG HỢP TOÀN BỘ LÀ FREE ===
  if (final <= 0 || paidBooks.length === 0) {
    await bot.sendMessage(msg.chat.id, `🎉 Tất cả truyện bạn chọn đều miễn phí! Đang gửi link...`);
    await sendBookLinks(msg.chat.id, selected, true);
    return;
  }

  // Tạo đơn
  let orderId = createOrderId();

  orders[orderId] = {
    chatId: msg.chat.id,
    books: selected,
    amount: final,
    paid: false
  };

  let content = orderId;
  let qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${final}&addInfo=${content}`;

  // Chia danh sách thành các phần (giữ nguyên logic cũ của bạn)
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
      captionPart += `🎁 Giảm giá: ${discount.toLocaleString('vi-VN')}đ\n`;
      captionPart += `💳 Số tiền cần thanh toán: ${final.toLocaleString('vi-VN')}đ\n\n`;

      captionPart += `🧾 Mã đơn hàng: ${orderId}\n`;
      captionPart += `📝 Nội dung chuyển khoản chính xác: \`${content}\`\n\n`;

      if (isFullPurchase) captionPart += `🎉 ĐÃ ÁP DỤNG ƯU ĐÃI MUA FULL!\n`;

      captionPart += `Cảm ơn bạn đã ủng hộ! ❤️`;
    }

    if (partNumber === 1) {
      await bot.sendPhoto(msg.chat.id, qrLink, {
        caption: captionPart,
        parse_mode: 'Markdown'
      });
    } else {
      await bot.sendMessage(msg.chat.id, captionPart, { parse_mode: 'Markdown' });
    }

    if (endIndex < selected.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    startIndex = endIndex;
    partNumber++;
  }

  // Phần hướng dẫn chuyển khoản
  let instructionText = `🔗 Quét mã QR ở tin nhắn đầu tiên hoặc chuyển khoản theo thông tin ngân hàng (0550767799967 MB Bank)\n`;
  instructionText += `Nội dung chuyển khoản phải đúng chính xác với Mã Đơn Hàng: \`${orderId}\`.\n\n`;

  instructionText += `⏳ Sau khi nhận được thanh toán, bot sẽ tự động gửi link truyện cho bạn ngay lập tức.\n\n`;

  instructionText += `⚠️ Lưu ý quan trọng:\n`;
  instructionText += `Khi tạo đơn mới thì mã QR của các đơn hàng trước bị vô hiệu.\n`;
  instructionText += `Chỉ quét mã QR của đơn tạo mới nhất.\n`;
  instructionText += `Nếu gặp lỗi (chuyển khoản thành công nhưng không nhận được truyện trong 5-10 phút), vui lòng liên hệ @ea7bpp gửi tin nhắn chứa mã đơn hàng ${orderId} và ảnh chụp chuyển khoản để được hỗ trợ nhanh chóng nhé!\n`;

  await bot.sendMessage(msg.chat.id, instructionText, { parse_mode: 'Markdown' });
});

app.get("/ping", (req, res) => {
  res.send("alive");
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});