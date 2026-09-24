/**
 * TRUYỆN ẾCH XANH TELEGRAM BOT
 * 
 * Entry point chính của ứng dụng bot bán truyện tự động
 * Tích hợp SePay Webhook + Neon PostgreSQL + VietQR Buffer cục bộ
 */

require('dotenv').config();
const { startApp } = require('./src/app');

// Khởi chạy ứng dụng
startApp();