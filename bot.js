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




// ======================
//       WEBHOOK
// ======================

// Webhook Sepay (nhận thông báo thanh toán)
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
    const ITEMS_PER_SUCCESS_MSG = 3;
    const totalParts = Math.ceil(order.books.length / ITEMS_PER_SUCCESS_MSG);

    for (let i = 0; i < order.books.length; i += ITEMS_PER_SUCCESS_MSG) {
      const chunk = order.books.slice(i, i + ITEMS_PER_SUCCESS_MSG);
      const partNumber = Math.floor(i / ITEMS_PER_SUCCESS_MSG) + 1;

      // Build link dùng id thật của truyện
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

      let successText = "";

      // Phần đầu tiên (phần 1) mới có hướng dẫn + cảm ơn
      if (partNumber === 1) {
        successText += `✅ THANH TOÁN THÀNH CÔNG!\n\n`;
        successText += `Cảm ơn bạn đã ủng hộ! Truyện đã mở khóa.\n\n`;
        successText += `Hướng dẫn đọc trên điện thoại:\n`;
        successText += `https://docs.google.com/document/d/1HYw_H1AzUoQwZudRZg3da4VlzMK7PEf-ey5jD2syMCY/edit?usp=sharing\n\n`;
        successText += `Truyện của bạn:\n${chunkLinks}\n\n`;
      } else {
        successText += `✅ Tiếp tục danh sách (Phần ${partNumber}/${totalParts})\n\n`;
        successText += `Truyện của bạn:\n${chunkLinks}\n\n`;
      }

      if (partNumber < totalParts) {
        successText += `(Còn phần sau...)\n\n`;
      } else {
        successText += `Mẹo: Dùng app Google Docs để đọc mượt. Có vấn đề gì nhắn @ea7bpp nhé!\n`;
        successText += `Chúc đọc vui! 🔥`;
      }

      // Gửi plain text (không preview link)
      await bot.sendMessage(order.chatId, successText);
      console.log(`Gửi thành công phần ${partNumber}/${totalParts} (plain text) cho đơn ${orderId}`);

      if (partNumber < totalParts) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    console.log(`Hoàn tất gửi link đơn ${orderId} (${totalParts} phần)`);

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

// START
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🐸 Chào mừng đến với Truyện Ếch Xanh

- Chat Box này dùng để xem list truyện, giá và mua truyện trực tiếp qua bot.

🤤 ƯU ĐÃI KHI MUA NHIỀU TRUYỆN:
• Mua từ bộ thứ 3 sẽ được giảm 20k
• Mua từ bộ thứ 4 trở đi sẽ được giảm thêm 10k mỗi bộ
• Ví dụ: Mua 3 bộ giảm 20k, mua 4 bộ giảm 30k, mua 5 bộ giảm 40k...

Nhấn /list để xem danh sách truyện`);
});

// === THÊM HÀM HỖ TRỢ PHÂN TRANG (đặt ở đầu file, trước các bot.onText) ===
async function generateListPage(page = 1) {
  try {
    let books = await getBooks();

    if (books.length === 0) {
      return {
        text: 'Hiện chưa có truyện nào trong database 😢. Liên hệ @ea7bpp để kiểm tra nhé!',
        inlineKeyboard: []
      };
    }

    // === ĐẢO NGƯỢC: truyện mới nhất (id lớn nhất) lên đầu ===
    books.sort((a, b) => b.id - a.id); // Nếu id không tăng dần theo thời gian thì thay bằng .reverse()

    const ITEMS_PER_MESSAGE = 3;
    const totalPages = Math.ceil(books.length / ITEMS_PER_MESSAGE);

    // Giới hạn page hợp lệ
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

    // Hướng dẫn mua luôn hiển thị (vì chỉ có 1 tin nhắn)
    text += `✍ Nhập số tương ứng với truyện bạn muốn mua (cách nhau bằng dấu cách nếu mua nhiều).\n\n`;
    text += `Ví dụ: 1 3 5`;

    // === XÂY DỰNG NÚT PHÂN TRANG ===
    const inlineKeyboard = [];

    // Hàng 1: Trang đầu + Trang trước (chỉ hiện khi không phải trang 1)
    const firstRow = [];
    if (page > 1) {
      firstRow.push({ text: '⏪ Trang đầu', callback_data: `list_page:1` });
      firstRow.push({ text: '◀️ Trang trước', callback_data: `list_page:${page - 1}` });
    }
    if (firstRow.length > 0) inlineKeyboard.push(firstRow);

    // Hàng số trang (5 nút mỗi hàng, hiện tất cả, trang hiện tại có 【 】)
    let pageRow = [];
    for (let p = 1; p <= totalPages; p++) {
      const btnText = (p === page) ? `【${p}】` : `${p}`;
      pageRow.push({ text: btnText, callback_data: `list_page:${p}` });

      if (pageRow.length === 5 || p === totalPages) {
        inlineKeyboard.push(pageRow);
        pageRow = [];
      }
    }

    // Hàng cuối: Trang sau + Trang cuối (chỉ hiện khi không phải trang cuối)
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

// === SỬA LẠI COMMAND /list (chỉ gửi trang 1) ===
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

// === THÊM HANDLER CALLBACK_QUERY (đặt ở bất kỳ đâu trong file bot, sau bot.onText) ===
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;

  // Chỉ xử lý nút phân trang của chúng ta
  if (!data.startsWith('list_page:')) return;

  const requestedPage = parseInt(data.split(':')[1]);
  if (isNaN(requestedPage)) return;

  try {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    const { text, inlineKeyboard } = await generateListPage(requestedPage);

    // Edit tin nhắn hiện tại thành trang mới
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

    // Xóa trạng thái "đang xử lý" của Telegram
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (err) {
    console.error("Lỗi khi chuyển trang list:", err.message || err);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Có lỗi khi chuyển trang!' });
  }
});

// // LIST TRUYỆN
// bot.onText(/\/list/, async (msg) => {
//   console.log("Hàm getBooks đã được gọi");

//   try {
//     const books = await getBooks();

//     if (books.length === 0) {
//       return bot.sendMessage(msg.chat.id, 'Hiện chưa có truyện nào trong database 😢. Liên hệ @ea7bpp để kiểm tra nhé!');
//     }

//     const ITEMS_PER_MESSAGE = 3;  // Có thể chỉnh thành 4 hoặc 6 tùy độ dài mô tả
//     const totalMessages = Math.ceil(books.length / ITEMS_PER_MESSAGE);

//     for (let i = 0; i < books.length; i += ITEMS_PER_MESSAGE) {
//       const chunk = books.slice(i, i + ITEMS_PER_MESSAGE);
//       const partNumber = Math.floor(i / ITEMS_PER_MESSAGE) + 1;

//       let text = `📚 Danh sách truyện (Phần ${partNumber}/${totalMessages})\n\n`;

//       chunk.forEach(b => {
//         text += `-----------------------------\n\n`;

//         if (b.free) {
//           text += `${b.id}. ${b.name}\n`;
//         } else {
//           text += `${b.id}. ${b.name}\n`;
//         }

//         text += `   📖 Số chương: ${b.chapters}\n`;
//         text += `   📏 Độ dài: ${b.chapterLength}\n`;
//         text += `   🎭 Thể loại: ${b.genres.join(", ")}\n`;
//         text += `   📝 Nội dung: ${b.description}\n`;
//         text += `   💰 Giá: ${b.free ? "Free" : b.price.toLocaleString('vi-VN') + "đ"}\n\n`;
//       });

//       // Nếu không phải phần cuối, thêm lời nhắc
//       if (partNumber >= totalMessages) {
//         // text += `Tiếp tục ở phần ${partNumber + 1}...\n`;
//         text += `✍ Nhập số tương ứng với truyện bạn muốn mua (cách nhau bằng dấu cách nếu mua nhiều).\n\n`;
//         text += `Ví dụ: 1 3 5\n`;
//       }


//       await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

//       // Delay nhẹ giữa các tin nhắn để tránh flood (Telegram giới hạn ~30 msg/giây nhưng an toàn hơn)
//       if (partNumber < totalMessages) {
//         await new Promise(resolve => setTimeout(resolve, 1000)); // 1.5 giây
//       }
//     }

//     console.log(`Đã gửi ${totalMessages} tin nhắn danh sách truyện cho user ${msg.chat.id}`);

//   } catch (err) {
//     console.error("Lỗi khi gửi /list:", err.message || err);
//     await bot.sendMessage(msg.chat.id, 'Có lỗi khi tải danh sách truyện 😵. Thử lại sau hoặc liên hệ @ea7bpp nhé!');
//   }
// });

// XỬ LÝ CHỌN TRUYỆN
bot.on("message", async (msg) => {
  let text = msg.text;
  if (!text) return;

  // Bỏ qua nếu là lệnh
  if (text.startsWith('/')) return;

  // Kiểm tra nhập số (ví dụ: 1 3 5)
  if (/^[0-9 ]+$/.test(text)) {
    let ids = text.split(" ").map(Number).filter(n => !isNaN(n));

    const allBooks = await getBooks();
    let selected = allBooks.filter(b => ids.includes(b.id));

    if (selected.length === 0) {
      return bot.sendMessage(msg.chat.id, 'Không tìm thấy truyện nào với số bạn nhập 😕. Hãy thử lại nhé!');
    }

    // Loại truyện free
    let paidBooks = selected.filter(b => !b.free);

    // Tính tổng tiền
    let total = paidBooks.reduce((s, b) => s + b.price, 0);

    // Số truyện tính tiền
    let count = paidBooks.length;

    // Tính giảm giá
    let discount = 0;
    if (count >= 3) discount += 20000;
    if (count >= 4) discount += (count - 3) * 10000;

    // Tiền cuối
    let final = total - discount;

    // ────────────────────────────────────────────────
// THÊM KIỂM TRA NÀY
if (final <= 0 || paidBooks.length === 0) {
  // Trường hợp: toàn bộ free hoặc không có truyện nào cần trả tiền

  let freeList = selected.map(b => `• ${b.id}. ${b.name}`).join("\n");

  let text = `🎉 Tất cả truyện bạn chọn đều miễn phí!\n\n`;
  text += `Danh sách truyện đã mở khóa ngay:\n${freeList}\n\n`;

  // Nếu có link thì gửi luôn link (tương tự phần success)
  if (selected.some(b => b.link && b.link.trim() !== '')) {
    text += `Link tải/đọc:\n`;
    selected.forEach(b => {
      if (b.link && b.link.trim()) {
        let links = b.link.split(', ').map(l => l.trim()).join("\n");
        text += `${b.id}. ${b.name}\n${links}\n\n`;
      }
    });
  } else {
    text += `(Hiện chưa có link cho các truyện này. Liên hệ @ea7bpp để nhận nhé!)\n`;
  }

  text += `Chúc bạn đọc vui! 🔥\n`;
  text += `Có thể tiếp tục chọn thêm truyện bằng cách nhập số khác.`;

  bot.sendMessage(msg.chat.id, text);
  return;  // dừng lại, không tạo đơn, không gửi QR
}
// ────────────────────────────────────────────────

    // Tạo đơn
    let orderId = createOrderId();

    orders[orderId] = {
      chatId: msg.chat.id,
      books: selected,
      amount: final,
      paid: false
    };

    // Nội dung chuyển khoản
    let content = orderId;

// QR ngân hàng
let qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${final}&addInfo=${content}`;

// Chia danh sách thành các phần, mỗi phần tối đa 8 bộ
const ITEMS_PER_PART = 3;
const totalParts = Math.ceil(selected.length / ITEMS_PER_PART);

let partNumber = 1;
let startIndex = 0;

while (startIndex < selected.length) {
  const endIndex = Math.min(startIndex + ITEMS_PER_PART, selected.length);
  const chunk = selected.slice(startIndex, endIndex);

  let captionPart = `🛒 GIỎ HÀNG CỦA BẠN ĐÃ SẴN SÀNG! (Phần ${partNumber}/${totalParts})\n\n`;

  captionPart += `Bạn đã chọn:\n${chunk.map(b => `• ${b.id}. ${b.name}`).join("\n")}\n`;

  // if (endIndex < selected.length) {
  //   captionPart += `(Còn tiếp tục ở phần sau...)\n\n`;
  // }

  // Chỉ hiển thị tổng tiền + thanh toán ở phần CUỐI CÙNG
  if (endIndex === selected.length) {
    captionPart += `\n💰 Tổng tiền gốc: ${total.toLocaleString('vi-VN')}đ\n`;
    captionPart += `🎁 Giảm giá: ${discount.toLocaleString('vi-VN')}đ\n`;
    captionPart += `💳 Số tiền cần thanh toán: ${final.toLocaleString('vi-VN')}đ\n\n`;

    captionPart += `🧾 Mã đơn hàng: ${orderId}\n`;
    captionPart += `📝 Nội dung chuyển khoản chính xác: \`${content}\`\n\n`;

    captionPart += `Cảm ơn bạn đã ủng hộ! ❤️`;
  }

  // Gửi tin nhắn
  if (partNumber === 1) {
    // Phần đầu tiên: kèm QR
    await bot.sendPhoto(msg.chat.id, qrLink, {
      caption: captionPart,
      parse_mode: 'Markdown'
    });
  } else {
    // Các phần sau: chỉ text
    await bot.sendMessage(msg.chat.id, captionPart, { parse_mode: 'Markdown' });
  }

  // Delay 1 giây giữa các tin nhắn (tránh flood)
  if (endIndex < selected.length) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  startIndex = endIndex;
  partNumber++;
}

// Phần hướng dẫn chuyển khoản riêng (gửi cuối cùng)
let instructionText = `🔗 Quét mã QR ở tin nhắn đầu tiên hoặc chuyển khoản theo thông tin ngân hàng (0550767799967 MB Bank)\n`;
instructionText += `Nội dung chuyển khoản phải đúng chính xác với Mã Đơn Hàng: \`${orderId}\`.\n\n`;

instructionText += `⏳ Sau khi nhận được thanh toán, bot sẽ tự động gửi link truyện cho bạn ngay lập tức.\n\n`;

instructionText += `⚠️ Lưu ý quan trọng:\n`;
instructionText += `Khi tạo đơn mới thì mã QR của các đơn hàng trước bị vô hiệu.\n`;
instructionText += `Chỉ quét mã QR của đơn tạo mới nhất.\n`;
instructionText += `Nếu gặp lỗi (chuyển khoản thành công nhưng không nhận được truyện trong 5-10 phút), vui lòng liên hệ @ea7bpp gửi tin nhắn chứa mã đơn hàng ${orderId} và ảnh chụp chuyển khoản để được hỗ trợ nhanh chóng nhé!\n`;

// instructionText += `Cảm ơn bạn đã ủng hộ! ❤️`;

await bot.sendMessage(msg.chat.id, instructionText, { parse_mode: 'Markdown' });

  }
});


app.get("/ping", (req, res) => {
  res.send("alive");
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});