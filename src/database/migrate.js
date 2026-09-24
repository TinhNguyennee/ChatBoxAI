const pool = require('./connection');

/**
 * Khởi tạo cấu trúc các bảng mới an toàn tuyệt đối (Không xóa, không sửa bảng cũ)
 */
async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Đang kiểm tra và khởi tạo các bảng cơ sở dữ liệu an toàn...');

    await client.query('BEGIN');

    // 1. Bảng lưu trữ thông tin User Telegram
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Bảng giỏ hàng cho từng User
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        telegram_id VARCHAR(64) NOT NULL,
        book_id INT NOT NULL,
        added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (telegram_id, book_id)
      );
    `);

    // 3. Bảng đơn hàng (Thời hạn 15 phút cho đơn PENDING)
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(64) PRIMARY KEY,
        telegram_id VARCHAR(64) NOT NULL,
        username VARCHAR(255),
        order_type VARCHAR(32) DEFAULT 'BOOKS',
        items JSONB DEFAULT '[]'::jsonb,
        original_amount INT NOT NULL,
        final_amount INT NOT NULL,
        discount_lines JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(32) DEFAULT 'PENDING',
        sepay_trans_id VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '15 minutes',
        paid_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_telegram ON orders(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at);
    `);

    // 4. Bảng tủ truyện đã mua của User (Tủ truyện của tôi)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_purchases (
        id SERIAL PRIMARY KEY,
        telegram_id VARCHAR(64) NOT NULL,
        book_id INT NOT NULL,
        order_id VARCHAR(64),
        purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(telegram_id, book_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_purchases_telegram ON user_purchases(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_book ON user_purchases(book_id);
    `);

    await client.query('COMMIT');
    console.log('✅ Khởi tạo cơ sở dữ liệu hoàn tất an toàn!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi khởi tạo cơ sở dữ liệu:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
