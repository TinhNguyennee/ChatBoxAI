const TelegramBot = require('node-telegram-bot-api');
// const QRCode = require("qrcode");

// TOKEN mới của bạn
const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token);



// danh sách truyện
const books = require("./books");

// nơi lưu đơn hàng
const orders = {};

// tạo mã đơn
function createOrderId(){
 return "OD" + Math.floor(Math.random()*1000000);
}

// START
bot.onText(/\/start/, (msg) => {

bot.sendMessage(msg.chat.id,
`📚 Chào mừng đến shop truyện

ƯU ĐÃI:
• Mua từ bộ thứ 3 giảm 20k
• Bộ thứ 4 trở đi giảm thêm 10k mỗi bộ

Nhấn /list để xem truyện`);

});

// LIST TRUYỆN
bot.onText(/\/list/, (msg)=>{

let text="📚 Danh sách truyện:\n\n";

books.forEach(b=>{
 if(b.free){
  text+=`${b.id}. ${b.name} – FREE\n`;
 }else{
  text+=`${b.id}. ${b.name} – ${b.price/1000}k\n`;
 }
});

text+=`
\nGõ số truyện để mua

Ví dụ:
1 2 4
`;

bot.sendMessage(msg.chat.id,text);

});

// KHI KHÁCH CHỌN TRUYỆN
bot.on("message",(msg)=>{

let text = msg.text;

if(!text) return;

// kiểm tra người dùng nhập số
if(/^[0-9 ]+$/.test(text)){

let ids = text.split(" ").map(Number);

// truyện đã chọn
let selected = books.filter(b=>ids.includes(b.id));

if(selected.length===0){
 return;
}

// loại truyện free
let paidBooks = selected.filter(b=>!b.free);

// tính tổng tiền
let total = paidBooks.reduce((s,b)=>s+b.price,0);

// số truyện tính tiền
let count = paidBooks.length;

// tính giảm giá
let discount = 0;

if(count>=3){
 discount+=20000;
}

if(count>=4){
 discount+=(count-3)*10000;
}

// tiền cuối
let final = total-discount;

// tạo đơn
let orderId = createOrderId();

orders[orderId] = {
 chatId: msg.chat.id,
 books: selected,
 amount: final,
 paid:false
};

// nội dung chuyển khoản
let content = orderId;

// QR ngân hàng
let qrLink = `https://img.vietqr.io/image/MB-0550767799967-compact.png?amount=${final}&addInfo=${content}`;

// gửi QR
bot.sendPhoto(msg.chat.id,qrLink,{
 caption:
`📦 Bạn đã chọn:

${selected.map(b=>b.name).join("\n")}

💰 Tổng tiền: ${total}đ
🎁 Giảm giá: ${discount}đ
💳 Thanh toán: ${final}đ

🧾 Mã đơn: ${orderId}

Nội dung chuyển khoản:
${content}

Sau khi thanh toán bot sẽ tự gửi truyện.`
});

}

});





const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

app.post(`/bot${token}`, (req, res) => {
 bot.processUpdate(req.body);
 res.sendStatus(200);
});





app.post("/sepay",(req,res)=>{

console.log("Webhook:",req.body);

let data = req.body;

let content = (data.content || data.description || "").trim().toUpperCase();
let amount = data.transferAmount || data.amount;

let orderId = Object.keys(orders).find(id => content.includes(id));

let order = orders[orderId];

if(order && !order.paid){

 if(order.amount == amount){

  order.paid = true;

  let links = order.books.map(b=>b.link).join("\n");

  bot.sendMessage(order.chatId,
`✅ Thanh toán thành công!

📚 Link truyện:

${links}

Cảm ơn bạn đã mua ❤️`);

 }

}

res.send("ok");

});

const url = "https://chatboxai-eoul.onrender.com";

bot.setWebHook(`${url}/bot${token}`);




const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
 console.log("Server running");
});

