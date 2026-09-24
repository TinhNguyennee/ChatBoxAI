const pool = require('./connection');

/**
 * Cập nhật hoặc thêm mới User khi họ tương tác với bot
 */
async function upsertUser(telegramId, username, firstName) {
  if (!telegramId) return;
  try {
    const query = `
      INSERT INTO users (telegram_id, username, first_name, last_interaction)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (telegram_id) 
      DO UPDATE SET 
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_interaction = NOW()
    `;
    await pool.query(query, [
      telegramId.toString(),
      username || null,
      firstName || null
    ]);
  } catch (err) {
    console.error('❌ Lỗi upsertUser:', err.message);
  }
}

/**
 * Lấy thông tin user
 */
async function getUser(telegramId) {
  if (!telegramId) return null;
  try {
    const res = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1 LIMIT 1',
      [telegramId.toString()]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('❌ Lỗi getUser:', err.message);
    return null;
  }
}

/**
 * Lấy danh sách ID của tất cả người dùng để gửi broadcast
 */
async function getAllUserIds() {
  try {
    const res = await pool.query('SELECT telegram_id FROM users');
    return res.rows.map(r => r.telegram_id);
  } catch (err) {
    console.error('❌ Lỗi getAllUserIds:', err.message);
    return [];
  }
}

/**
 * Đếm tổng số người dùng trong bot
 */
async function getUserCount() {
  try {
    const res = await pool.query('SELECT COUNT(*) as count FROM users');
    return parseInt(res.rows[0].count, 10) || 0;
  } catch (err) {
    console.error('❌ Lỗi getUserCount:', err.message);
    return 0;
  }
}

module.exports = {
  upsertUser,
  getUser,
  getAllUserIds,
  getUserCount
};
