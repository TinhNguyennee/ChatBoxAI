/**
 * SCRIPT GIẢ LẬP WEBHOOK SEPAY (DÙNG ĐỂ TEST THANH TOÁN KHÔNG CẦN CHUYỂN TIỀN THẬT)
 * 
 * Cách dùng trong terminal:
 *   node test/mock_sepay.js <MÃ_ĐƠN> <SỐ_TIỀN>
 * 
 * Ví dụ:
 *   node test/mock_sepay.js OD123456 56400
 */

const http = require('http');

const orderId = process.argv[2];
const amount = parseInt(process.argv[3], 10);

if (!orderId || isNaN(amount)) {
  console.log('⚠️ Hướng dẫn sử dụng:');
  console.log('   node test/mock_sepay.js <MÃ_ĐƠN_HÀNG> <SỐ_TIỀN>');
  console.log('Ví dụ:');
  console.log('   node test/mock_sepay.js OD845123 50000\n');
  process.exit(1);
}

const payload = JSON.stringify({
  id: Math.floor(Math.random() * 10000000),
  gateway: "MBBank",
  transactionDate: new Date().toISOString(),
  accountNumber: "0550767799967",
  transferAmount: amount,
  content: `CK ${orderId}`,
  description: `Thanh toan don ${orderId}`,
  referenceCode: `FT${Date.now()}`
});

const req = http.request({
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/sepay',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`✅ Kết quả Webhook SePay (Status ${res.statusCode}):`, data);
    console.log('👉 Hãy kiểm tra lại Telegram xem bot đã tự động gửi truyện cho bạn chưa nhé!');
  });
});

req.on('error', (err) => {
  console.error('❌ Không thể kết nối tới bot. Hãy chắc chắn bạn đã chạy bot trước bằng lệnh: node bot.js');
  console.error('Chi tiết lỗi:', err.message);
});

req.write(payload);
req.end();
