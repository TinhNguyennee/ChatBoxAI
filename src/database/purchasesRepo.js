const pool = require('./connection');

/**
 * Ghi nhận các cuốn truyện người dùng đã mua thành công
 */
async function addPurchases(telegramId, bookIds, orderId = null) {
  if (!telegramId || !bookIds || bookIds.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const bookId of bookIds) {
      await client.query(
        `INSERT INTO user_purchases (telegram_id, book_id, order_id, purchased_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (telegram_id, book_id) DO NOTHING`,
        [telegramId.toString(), bookId, orderId]
      );
    }
    await client.query('COMMIT');
    console.log(`✅ Đã lưu ${bookIds.length} truyện vào tủ của User ${telegramId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi addPurchases:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Lấy danh sách tất cả các cuốn truyện mà người dùng đã sở hữu (Tủ truyện của tôi)
 */
async function getUserPurchases(telegramId) {
  if (!telegramId) return [];
  try {
    const query = `
      SELECT b.*, up.purchased_at
      FROM user_purchases up
      JOIN books b ON up.book_id = b.id
      WHERE up.telegram_id = $1
      ORDER BY up.purchased_at DESC
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
      genres: row.genres ? row.genres.split(',').map(g => g.trim()).filter(Boolean) : [],
      purchasedAt: row.purchased_at
    }));
  } catch (err) {
    console.error('❌ Lỗi getUserPurchases:', err.message);
    return [];
  }
}

/**
 * Kiểm tra xem người dùng đã sở hữu cuốn truyện này hay chưa
 */
async function hasUserPurchased(telegramId, bookId) {
  if (!telegramId || !bookId) return false;
  try {
    const res = await pool.query(
      'SELECT 1 FROM user_purchases WHERE telegram_id = $1 AND book_id = $2 LIMIT 1',
      [telegramId.toString(), bookId]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('❌ Lỗi hasUserPurchased:', err.message);
    return false;
  }
}

/**
 * Đếm tổng số truyện người dùng đang sở hữu
 */
async function getUserPurchasesCount(telegramId) {
  if (!telegramId) return 0;
  try {
    const res = await pool.query(
      'SELECT COUNT(*) as count FROM user_purchases WHERE telegram_id = $1',
      [telegramId.toString()]
    );
    return parseInt(res.rows[0].count, 10) || 0;
  } catch (err) {
    console.error('❌ Lỗi getUserPurchasesCount:', err.message);
    return 0;
  }
}

module.exports = {
  addPurchases,
  getUserPurchases,
  hasUserPurchased,
  getUserPurchasesCount
};
