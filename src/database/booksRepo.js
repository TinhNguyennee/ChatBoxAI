const pool = require('./connection');

/**
 * Lấy danh sách tất cả các cuốn truyện
 */
async function getBooks() {
  try {
    const res = await pool.query('SELECT * FROM books ORDER BY id ASC');
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
      sold_quantity: parseInt(row.sold_quantity, 10) || 0
    }));
  } catch (err) {
    console.error('❌ Lỗi query books:', err.message);
    return [];
  }
}

/**
 * Lấy thông tin chi tiết một cuốn truyện theo ID
 */
async function getBookById(id) {
  try {
    const res = await pool.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
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
      sold_quantity: parseInt(row.sold_quantity, 10) || 0
    };
  } catch (err) {
    console.error(`❌ Lỗi query book by id (${id}):`, err.message);
    return null;
  }
}

/**
 * Tăng số lượng đã bán (sold_quantity) cho danh sách các truyện
 */
async function incrementSoldQuantity(bookIds) {
  if (!bookIds || bookIds.length === 0) return;
  try {
    await pool.query(
      'UPDATE books SET sold_quantity = COALESCE(sold_quantity, 0) + 1 WHERE id = ANY($1)',
      [bookIds]
    );
    console.log(`📈 Đã +1 sold_quantity cho ${bookIds.length} truyện (IDs: ${bookIds.join(', ')})`);
  } catch (err) {
    console.error('❌ Lỗi update sold_quantity:', err.message);
  }
}

/**
 * Lấy top truyện bán chạy nhất cho mục thống kê Admin
 */
async function getTopSellingBooks(limit = 5) {
  try {
    const res = await pool.query(
      'SELECT id, name, sold_quantity FROM books ORDER BY COALESCE(sold_quantity, 0) DESC LIMIT $1',
      [limit]
    );
    return res.rows;
  } catch (err) {
    console.error('❌ Lỗi query top selling books:', err.message);
    return [];
  }
}

module.exports = {
  getBooks,
  getBookById,
  incrementSoldQuantity,
  getTopSellingBooks
};
