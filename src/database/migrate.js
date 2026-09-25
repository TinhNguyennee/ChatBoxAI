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

    // 3. Đảm bảo bảng orders có đầy đủ các cột (tương thích 100% với 732 đơn cũ)
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(64),
        order_code VARCHAR(64),
        telegram_id VARCHAR(64),
        username VARCHAR(255),
        order_type VARCHAR(32) DEFAULT 'BOOKS',
        items JSONB DEFAULT '[]'::jsonb,
        books TEXT,
        original_amount INT,
        final_amount INT,
        amount BIGINT,
        discount_lines JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(32) DEFAULT 'PENDING',
        sepay_trans_id VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE,
        paid_at TIMESTAMP WITH TIME ZONE
      );
    `);

    // Thêm các cột bổ trợ nếu bảng orders đã tồn tại từ trước mà chưa có
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_id VARCHAR(64);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code VARCHAR(64);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS username VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(32) DEFAULT 'BOOKS';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS books TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_amount INT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_amount INT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount BIGINT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_lines JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS sepay_trans_id VARCHAR(128);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS message_id BIGINT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
    `);

    // Đồng bộ các đơn cũ nếu có
    await client.query(`
      UPDATE orders SET order_id = order_code WHERE order_id IS NULL AND order_code IS NOT NULL;
      UPDATE orders SET final_amount = amount::int, original_amount = amount::int WHERE final_amount IS NULL AND amount IS NOT NULL;
      UPDATE orders SET paid_at = created_at WHERE paid_at IS NULL AND status = 'completed';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_telegram ON orders(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
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
