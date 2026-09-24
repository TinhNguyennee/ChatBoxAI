require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT || 3000,
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL || "https://chatboxai-eoul.onrender.com",
  
  // Thông tin ngân hàng nhận tiền
  BANK_ACCOUNT_NO: process.env.BANK_ACCOUNT_NO || "0550767799967",
  BANK_BIN: process.env.BANK_BIN || "970422", // MB Bank
  BANK_NAME: process.env.BANK_NAME || "MB Bank",
  
  // Quản trị viên & hỗ trợ
  ADMIN_TELEGRAM_IDS: (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map(id => id.trim()).filter(Boolean),
  SUPPORT_USERNAME: process.env.SUPPORT_USERNAME || "@ea7bpp",
  
  // Giá VIP & Webhook SePay
  VIP_PRICE: parseInt(process.env.VIP_PRICE, 10) || 139000,
  SEPAY_API_KEY: process.env.SEPAY_API_KEY || "", // Nếu có cấu hình trên SePay
  
  // Hướng dẫn đọc
  GUIDE_LINK: process.env.GUIDE_LINK || "https://docs.google.com/document/d/1HYw_H1AzUoQwZudRZg3da4VlzMK7PEf-ey5jD2syMCY/edit?usp=sharing"
};
