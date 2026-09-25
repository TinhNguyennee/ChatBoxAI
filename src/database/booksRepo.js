const pool = require('./connection');
const { getCachedBooks, setCachedBooks, clearBooksCache } = require('./cache');

/**
 * Lấy danh sách tất cả các cuốn truyện (Có In-Memory Cache 0ms)
 */
async function getBooks() {
  const cached = getCachedBooks();
  if (cached) {
    return cached;
  }

  try {
    const res = await pool.query('SELECT * FROM books ORDER BY id ASC');
    const books = res.rows.map(row => ({
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

    setCachedBooks(books);
    return books;
  } catch (err) {
    console.error('❌ Lỗi query books:', err.message);
    return [];
  }
}

/**
 * Lấy thông tin chi tiết một cuốn truyện theo ID (Ưu tiên đọc từ Cache 0ms)
 */
async function getBookById(id) {
  const numId = parseInt(id, 10);
  const cached = getCachedBooks();
  if (cached) {
    const found = cached.find(b => b.id === numId);
    if (found) return found;
  }

  try {
    const res = await pool.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [numId]);
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
    clearBooksCache(); // Xóa cache để làm mới sold_quantity
    console.log(`📈 Đã +1 sold_quantity cho ${bookIds.length} truyện (IDs: ${bookIds.join(', ')})`);
  } catch (err) {
    console.error('❌ Lỗi update sold_quantity:', err.message);
  }
}

/**
 * Lấy top truyện bán chạy nhất cho mục thống kê Admin (ĐÃ LỌC BỎ TRUYỆN FREE)
 */
async function getTopSellingBooks(limit = 5) {
  try {
    const res = await pool.query(
      `SELECT id, name, sold_quantity, price 
       FROM books 
       WHERE COALESCE(free, false) = false AND COALESCE(sold_quantity, 0) > 0
       ORDER BY COALESCE(sold_quantity, 0) DESC 
       LIMIT $1`,
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
