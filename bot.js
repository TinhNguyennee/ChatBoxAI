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
app.post("/sepay", (req, res) => {
  console.log("Webhook Sepay:", req.body);

  let data = req.body;
  let content = (data.content || data.description || "").trim().toUpperCase();
  let amount = data.transferAmount || data.amount;

  let orderId = Object.keys(orders).find(id => content.includes(id));
  let order = orders[orderId];

  if (order && !order.paid) {
    if (order.amount == amount) {
      order.paid = true;

      // Chuẩn bị danh sách link đẹp
      let bookLinksText = order.books
        .map((b, index) => {
          let linkParts = b.link.split(', ').map(part => part.trim());
          
          let linksDisplay = linkParts
            .map((part, i) => {
              if (part.includes('(Part')) {
                return part;
              } else if (linkParts.length > 1) {
                return `Link part ${i + 1}: ${part}`;
              } else {
                return part;
              }
            })
            .join("\n");

          return `${index + 1}. ${b.name}\n${linksDisplay}`;
        })
        .join("\n\n");

      bot.sendMessage(order.chatId,
        `✅ **THANH TOÁN THÀNH CÔNG!**

Cảm ơn bạn đã ủng hộ! ❤️ Truyện đã được mở khóa.

**Hướng dẫn đọc truyện trên điện thoại qua Link Google Docs:**
https://docs.google.com/document/d/1HYw_H1AzUoQwZudRZg3da4VlzMK7PEf-ey5jD2syMCY/edit?usp=sharing

---------------------------

**Danh sách truyện của bạn:**

${bookLinksText}

---------------------------

📌 Mẹo nhỏ: Mở link bằng app Google Docs để đọc mượt mà hơn (cuộn dễ, có mục lục chương). Nếu gặp vấn đề gì, liên hệ admin @Falris_tn nhé!

Chúc bạn đọc truyện vui vẻ! 🔥`,
        { parse_mode: 'Markdown' }
      );

      // Xóa order sau khi xử lý xong
      delete orders[orderId];
    }
  }

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

// LIST TRUYỆN
bot.onText(/\/list/, async (msg) => {
  console.log("Hàm getBooks đã được gọi");

  try {
    const books = await getBooks();

    if (books.length === 0) {
      return bot.sendMessage(msg.chat.id, 'Hiện chưa có truyện nào trong database 😢. Liên hệ @Falris_tn để kiểm tra nhé!');
    }

    const ITEMS_PER_MESSAGE = 3;  // Có thể chỉnh thành 4 hoặc 6 tùy độ dài mô tả
    const totalMessages = Math.ceil(books.length / ITEMS_PER_MESSAGE);

    for (let i = 0; i < books.length; i += ITEMS_PER_MESSAGE) {
      const chunk = books.slice(i, i + ITEMS_PER_MESSAGE);
      const partNumber = Math.floor(i / ITEMS_PER_MESSAGE) + 1;

      let text = `📚 Danh sách truyện (Phần ${partNumber}/${totalMessages})\n\n`;

      chunk.forEach(b => {
        text += `-----------------------------\n\n`;

        if (b.free) {
          text += `${b.id}*. ${b.name}\n`;
        } else {
          text += `${b.id}. ${b.name}\n`;
        }

        text += `   📖 Số chương: ${b.chapters}\n`;
        text += `   📏 Độ dài: ${b.chapterLength}\n`;
        text += `   🎭 Thể loại: ${b.genres.join(", ")}\n`;
        text += `   📝 Nội dung: ${b.description}\n`;
        text += `   💰 Giá: ${b.free ? "Free" : b.price.toLocaleString('vi-VN') + "đ"}\n\n`;
      });

      // Nếu không phải phần cuối, thêm lời nhắc
      if (partNumber < totalMessages) {
        text += `Tiếp tục ở phần ${partNumber + 1}...\n`;
      }

      text += `✍ Nhập số tương ứng với truyện bạn muốn mua (cách nhau bằng dấu cách nếu mua nhiều).\n\n`;
      text += `Ví dụ: 1 3 5\n`;

      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

      // Delay nhẹ giữa các tin nhắn để tránh flood (Telegram giới hạn ~30 msg/giây nhưng an toàn hơn)
      if (partNumber < totalMessages) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 giây
      }
    }

    console.log(`Đã gửi ${totalMessages} tin nhắn danh sách truyện cho user ${msg.chat.id}`);

  } catch (err) {
    console.error("Lỗi khi gửi /list:", err.message || err);
    await bot.sendMessage(msg.chat.id, 'Có lỗi khi tải danh sách truyện 😵. Thử lại sau hoặc liên hệ @Falris_tn nhé!');
  }
});

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

    // Gửi QR + caption
    bot.sendPhoto(msg.chat.id, qrLink, {
      caption: `📦 **ĐƠN HÀNG CỦA BẠN ĐÃ SẴN SÀNG!**

Bạn đã chọn:
${selected.map(b => `• ${b.name}`).join("\n")}

💰 **Tổng tiền gốc:** ${total.toLocaleString('vi-VN')}đ
🎁 **Giảm giá:** ${discount.toLocaleString('vi-VN')}đ
💳 **Số tiền cần thanh toán:** ${final.toLocaleString('vi-VN')}đ

🧾 **Mã đơn hàng:** ${orderId}
📝 **Nội dung chuyển khoản chính xác:**  
\`${content}\`

🔗 **Quét mã QR bên trên** hoặc chuyển khoản theo thông tin ngân hàng (0550767799967 MB Bank) nội dung chuyển khoản phải đúng chính xác với Mã Đơn Hàng.

⏳ Sau khi nhận được thanh toán, bot sẽ **tự động gửi link truyện** cho bạn ngay lập tức.

⚠️ **Lưu ý quan trọng:**  
Nếu gặp lỗi trong quá trình thanh toán (chuyển khoản thành công nhưng không nhận được truyện trong vòng 5-10 phút), vui lòng liên hệ ngay admin qua @Falris_tn hoặc gửi tin nhắn chứa mã đơn hàng ${orderId} để được hỗ trợ nhanh chóng nhé!

Cảm ơn bạn đã ủng hộ! ❤️`,
      parse_mode: 'Markdown'
    });
  }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});