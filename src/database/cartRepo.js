const pool = require('./connection');

/**
 * Lấy danh sách các truyện có trong giỏ hàng của User kèm thông tin chi tiết
 */
async function getCart(telegramId) {
  if (!telegramId) return [];
  try {
    const query = `
      SELECT b.* 
      FROM cart_items c
      JOIN books b ON c.book_id = b.id
      WHERE c.telegram_id = $1
      ORDER BY c.added_at ASC
    `;
    const res = await pool.query(query, [telegramId.toString()]);
    return res.rows.map(row => ({
      id: row.id,
      name: row.name,
      chapters: row.chapters,
      chapterLength: row.chapterlength,
      description: row.description,
      free: Boolean(row.free),
      price: parseInt(row.price, 10) || 0,
      link: row.link || '',
      link_free: row.link_free || '',
      genres: row.genres ? row.genres.split(',').map(g => g.trim()).filter(Boolean) : []
    }));
  } catch (err) {
    console.error('❌ Lỗi getCart:', err.message);
    return [];
  }
}

/**
 * Lấy số lượng truyện đang có trong giỏ
 */
async function getCartCount(telegramId) {
  if (!telegramId) return 0;
  try {
    const res = await pool.query(
      'SELECT COUNT(*) as count FROM cart_items WHERE telegram_id = $1',
      [telegramId.toString()]
    );
    return parseInt(res.rows[0].count, 10) || 0;
  } catch (err) {
    console.error('❌ Lỗi getCartCount:', err.message);
    return 0;
  }
}

/**
 * Kiểm tra xem cuốn truyện có đang nằm trong giỏ hay không
 */
async function isBookInCart(telegramId, bookId) {
  if (!telegramId || !bookId) return false;
  try {
    const res = await pool.query(
      'SELECT 1 FROM cart_items WHERE telegram_id = $1 AND book_id = $2 LIMIT 1',
      [telegramId.toString(), bookId]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('❌ Lỗi isBookInCart:', err.message);
    return false;
  }
}

/**
 * Thêm một cuốn truyện vào giỏ
 */
async function addToCart(telegramId, bookId) {
  if (!telegramId || !bookId) return false;
  try {
    await pool.query(
      'INSERT INTO cart_items (telegram_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [telegramId.toString(), bookId]
    );
    return true;
  } catch (err) {
    console.error('❌ Lỗi addToCart:', err.message);
    return false;
  }
}

/**
 * Xóa một cuốn truyện khỏi giỏ
 */
async function removeFromCart(telegramId, bookId) {
  if (!telegramId || !bookId) return false;
  try {
    await pool.query(
      'DELETE FROM cart_items WHERE telegram_id = $1 AND book_id = $2',
      [telegramId.toString(), bookId]
    );
    return true;
  } catch (err) {
    console.error('❌ Lỗi removeFromCart:', err.message);
    return false;
  }
}

/**
 * Xóa sạch toàn bộ giỏ hàng của user
 */
async function clearCart(telegramId) {
  if (!telegramId) return false;
  try {
    await pool.query(
      'DELETE FROM cart_items WHERE telegram_id = $1',
      [telegramId.toString()]
    );
    return true;
  } catch (err) {
    console.error('❌ Lỗi clearCart:', err.message);
    return false;
  }
}

module.exports = {
  getCart,
  getCartCount,
  isBookInCart,
  addToCart,
  removeFromCart,
  clearCart
};
