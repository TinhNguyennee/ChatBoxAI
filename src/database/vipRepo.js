const pool = require('./connection');
const { isCachedVIP, addCachedVIP, removeCachedVIP, setAllCachedVIPs } = require('./cache');

/**
 * Tải trước danh sách VIP vào RAM khi khởi động bot
 */
async function preloadVIPCache() {
  try {
    const res = await pool.query('SELECT telegram_id FROM vip');
    const ids = res.rows.map(r => r.telegram_id);
    setAllCachedVIPs(ids);
  } catch (err) {
    console.error('❌ Lỗi preloadVIPCache:', err.message);
  }
}

/**
 * Kiểm tra xem user có quyền VIP hay không (Ưu tiên Cache RAM 0ms)
 */
async function isUserVIP(chatId) {
  if (!chatId) return false;
  const cached = isCachedVIP(chatId);
  if (cached !== null) {
    return cached;
  }

  try {
    const res = await pool.query(
      'SELECT 1 FROM vip WHERE telegram_id = $1 LIMIT 1', 
      [chatId.toString()]
    );
    const isVIP = res.rowCount > 0;
    if (isVIP) addCachedVIP(chatId);
    return isVIP;
  } catch (err) {
    console.error('❌ Lỗi check VIP:', err.message);
    return false;
  }
}

/**
 * Thêm user vào bảng VIP (Đồng bộ cả DB và Cache RAM)
 */
async function addToVIP(chatId) {
  if (!chatId) return false;
  try {
    await pool.query(
      'INSERT INTO vip (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
      [chatId.toString()]
    );
    addCachedVIP(chatId);
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
    removeCachedVIP(chatId);
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
  preloadVIPCache,
  isUserVIP,
  addToVIP,
  removeFromVIP,
  getVIPCount
};
