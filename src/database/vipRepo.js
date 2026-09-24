const pool = require('./connection');

/**
 * Kiểm tra xem user có quyền VIP hay không
 */
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

/**
 * Thêm user vào bảng VIP
 */
async function addToVIP(chatId) {
  if (!chatId) return false;
  try {
    await pool.query(
      'INSERT INTO vip (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
      [chatId.toString()]
    );
    console.log(`✅ Đã cấp VIP cho Telegram ID: ${chatId}`);
    return true;
  } catch (err) {
    console.error('❌ Lỗi thêm VIP:', err.message);
    return false;
  }
}

/**
 * Xóa user khỏi bảng VIP (nếu cần quản trị viên gỡ VIP)
 */
async function removeFromVIP(chatId) {
  if (!chatId) return false;
  try {
    await pool.query('DELETE FROM vip WHERE telegram_id = $1', [chatId.toString()]);
    console.log(`🗑️ Đã thu hồi VIP của Telegram ID: ${chatId}`);
    return true;
  } catch (err) {
    console.error('❌ Lỗi gỡ VIP:', err.message);
    return false;
  }
}

/**
 * Đếm tổng số thành viên VIP
 */
async function getVIPCount() {
  try {
    const res = await pool.query('SELECT COUNT(*) as count FROM vip');
    return parseInt(res.rows[0].count, 10) || 0;
  } catch (err) {
    console.error('❌ Lỗi getVIPCount:', err.message);
    return 0;
  }
}

module.exports = {
  isUserVIP,
  addToVIP,
  removeFromVIP,
  getVIPCount
};
