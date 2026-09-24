const pool = require('./connection');
const { ORDER_STATUS, ORDER_TYPE } = require('../config/constants');

/**
 * Tạo đơn hàng mới với thời hạn hiệu lực 15 phút
 */
async function createOrder({
  orderId,
  telegramId,
  username,
  orderType = ORDER_TYPE.BOOKS,
  items = [],
  originalAmount,
  finalAmount,
  discountLines = []
}) {
  try {
    const query = `
      INSERT INTO orders (
        order_id, 
        telegram_id, 
        username, 
        order_type, 
        items, 
        original_amount, 
        final_amount, 
        discount_lines, 
        status, 
        created_at, 
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW() + INTERVAL '15 minutes')
      RETURNING *
    `;
    const res = await pool.query(query, [
      orderId,
      telegramId.toString(),
      username || null,
      orderType,
      JSON.stringify(items),
      originalAmount,
      finalAmount,
      JSON.stringify(discountLines),
      ORDER_STATUS.PENDING
    ]);
    return res.rows[0];
  } catch (err) {
    console.error('❌ Lỗi createOrder:', err.message);
    throw err;
  }
}

/**
 * Tìm đơn hàng theo mã đơn
 */
async function getOrderById(orderId) {
  if (!orderId) return null;
  try {
    const res = await pool.query('SELECT * FROM orders WHERE order_id = $1 LIMIT 1', [orderId]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('❌ Lỗi getOrderById:', err.message);
    return null;
  }
}

/**
 * Tìm đơn PENDING khớp với nội dung chuyển khoản từ SePay
 */
async function findPendingOrderByContent(content) {
  if (!content) return null;
  try {
    const upperContent = content.toUpperCase();
    const res = await pool.query(
      `SELECT * FROM orders 
       WHERE status = $1 
         AND expires_at > NOW() 
         AND $2 LIKE ('%' || order_id || '%')
       LIMIT 1`,
      [ORDER_STATUS.PENDING, upperContent]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('❌ Lỗi findPendingOrderByContent:', err.message);
    return null;
  }
}

/**
 * Đánh dấu đơn hàng là đã thanh toán thành công
 */
async function markOrderAsPaid(orderId, sepayTransId = null) {
  try {
    const res = await pool.query(
      `UPDATE orders 
       SET status = $1, paid_at = NOW(), sepay_trans_id = $2
       WHERE order_id = $3
       RETURNING *`,
      [ORDER_STATUS.PAID, sepayTransId, orderId]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('❌ Lỗi markOrderAsPaid:', err.message);
    return null;
  }
}

/**
 * Lấy danh sách các đơn hàng PENDING đã quá 15 phút cần thông báo và dọn dẹp
 */
async function getExpiredPendingOrders() {
  try {
    const res = await pool.query(
      `SELECT * FROM orders 
       WHERE status = $1 AND expires_at <= NOW()`,
      [ORDER_STATUS.PENDING]
    );
    return res.rows;
  } catch (err) {
    console.error('❌ Lỗi getExpiredPendingOrders:', err.message);
    return [];
  }
}

/**
 * Xóa một đơn hàng khỏi database (dùng khi đơn hết hạn để giải phóng bộ nhớ Neon)
 */
async function deleteOrder(orderId) {
  if (!orderId) return false;
  try {
    await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    return true;
  } catch (err) {
    console.error(`❌ Lỗi deleteOrder (${orderId}):`, err.message);
    return false;
  }
}

/**
 * Thống kê doanh thu cho Admin
 */
async function getRevenueStats() {
  try {
    const totalQuery = await pool.query(
      `SELECT 
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COUNT(*) as total_orders
       FROM orders WHERE status = $1`,
      [ORDER_STATUS.PAID]
    );

    const todayQuery = await pool.query(
      `SELECT 
        COALESCE(SUM(final_amount), 0) as today_revenue,
        COUNT(*) as today_orders
       FROM orders 
       WHERE status = $1 AND paid_at >= CURRENT_DATE`,
      [ORDER_STATUS.PAID]
    );

    const monthQuery = await pool.query(
      `SELECT 
        COALESCE(SUM(final_amount), 0) as month_revenue,
        COUNT(*) as month_orders
       FROM orders 
       WHERE status = $1 AND paid_at >= date_trunc('month', CURRENT_DATE)`,
      [ORDER_STATUS.PAID]
    );

    return {
      totalRevenue: parseInt(totalQuery.rows[0].total_revenue, 10),
      totalOrders: parseInt(totalQuery.rows[0].total_orders, 10),
      todayRevenue: parseInt(todayQuery.rows[0].today_revenue, 10),
      todayOrders: parseInt(todayQuery.rows[0].today_orders, 10),
      monthRevenue: parseInt(monthQuery.rows[0].month_revenue, 10),
      monthOrders: parseInt(monthQuery.rows[0].month_orders, 10)
    };
  } catch (err) {
    console.error('❌ Lỗi getRevenueStats:', err.message);
    return {
      totalRevenue: 0, totalOrders: 0,
      todayRevenue: 0, todayOrders: 0,
      monthRevenue: 0, monthOrders: 0
    };
  }
}

module.exports = {
  createOrder,
  getOrderById,
  findPendingOrderByContent,
  markOrderAsPaid,
  getExpiredPendingOrders,
  deleteOrder,
  getRevenueStats
};
