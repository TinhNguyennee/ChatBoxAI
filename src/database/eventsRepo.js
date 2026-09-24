const pool = require('./connection');

/**
 * Lấy % giảm giá sự kiện hiện tại
 */
async function getActiveEventDiscountPercent() {
  try {
    const res = await pool.query(
      'SELECT percent FROM discount_events WHERE active = true LIMIT 1'
    );
    return res.rows.length > 0 ? parseInt(res.rows[0].percent, 10) || 0 : 0;
  } catch (err) {
    console.error('❌ Lỗi lấy event discount:', err.message);
    return 0;
  }
}

/**
 * Lấy thông tin chi tiết sự kiện đang hoạt động (banner + %)
 */
async function getActiveEvent() {
  try {
    const res = await pool.query(
      'SELECT id, content, percent, active FROM discount_events WHERE active = true LIMIT 1'
    );
    if (res.rows.length > 0) {
      return {
        id: res.rows[0].id,
        content: res.rows[0].content || '',
        percent: parseInt(res.rows[0].percent, 10) || 0,
        active: Boolean(res.rows[0].active)
      };
    }
    return null;
  } catch (err) {
    console.error('❌ Lỗi lấy active event:', err.message);
    return null;
  }
}

/**
 * Bật/tắt sự kiện hoặc cập nhật nội dung sự kiện (Dành cho Admin)
 */
async function setEventStatus(active, percent = 0, content = '') {
  try {
    const check = await pool.query('SELECT id FROM discount_events LIMIT 1');
    if (check.rows.length > 0) {
      await pool.query(
        'UPDATE discount_events SET active = $1, percent = $2, content = $3 WHERE id = $4',
        [active, percent, content, check.rows[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO discount_events (content, percent, active) VALUES ($1, $2, $3)',
        [content, percent, active]
      );
    }
    return true;
  } catch (err) {
    console.error('❌ Lỗi cập nhật discount_events:', err.message);
    return false;
  }
}

module.exports = {
  getActiveEventDiscountPercent,
  getActiveEvent,
  setEventStatus
};
