const pool = require('./connection');

/**
 * Script backfill (đồng bộ an toàn) kho truyện cho khách hàng cũ từ lịch sử đơn hàng
 * Tuyệt đối không xóa, không sửa dữ liệu cũ.
 * Sử dụng ON CONFLICT DO NOTHING để chống trùng lặp.
 */
async function backfillPurchases() {
  const client = await pool.connect();
  console.log('🚀 Bắt đầu quá trình đồng bộ lại Tủ truyện (user_purchases) từ orders...');

  try {
    await client.query('BEGIN');

    // 1. Lấy tất cả các đơn hàng đã thanh toán thành công
    const ordersRes = await client.query(`
      SELECT id, order_id, order_code, telegram_id, username, order_type, items, books, created_at, paid_at, status
      FROM orders
      WHERE LOWER(status) IN ('completed', 'paid')
      ORDER BY id ASC
    `);

    const orders = ordersRes.rows;
    console.log(`📦 Tìm thấy ${orders.length} đơn hàng thành công.`);

    // 2. Lấy danh sách ID truyện hợp lệ hiện có trong bảng books để đối chiếu an toàn
    const booksRes = await client.query('SELECT id FROM books');
    const validBookIds = new Set(booksRes.rows.map(b => b.id));
    console.log(`📚 Đang có ${validBookIds.size} truyện trong kho sách hệ thống.`);

    let usersProcessed = new Set();
    let insertedPurchases = 0;
    let skippedPurchases = 0;
    let vipOrdersSkipped = 0;

    for (const order of orders) {
      const telegramId = order.telegram_id ? String(order.telegram_id).trim() : null;
      if (!telegramId) continue;

      // Đồng bộ thông tin người dùng vào bảng users
      if (!usersProcessed.has(telegramId)) {
        usersProcessed.add(telegramId);
        const username = order.username ? String(order.username).trim() : null;
        const purchaseDate = order.created_at || new Date();
        await client.query(`
          INSERT INTO users (telegram_id, username, first_name, created_at, last_interaction)
          VALUES ($1, $2, $2, $3, $3)
          ON CONFLICT (telegram_id) DO UPDATE SET
            username = COALESCE(users.username, EXCLUDED.username)
        `, [telegramId, username, purchaseDate]);
      }

      // Kiểm tra nếu là đơn VIP thì bỏ qua (VIP đã quản lý ở bảng vip)
      const orderType = String(order.order_type || '').toUpperCase();
      const booksStr = String(order.books || '').trim();
      if (orderType === 'VIP' || booksStr.toUpperCase() === 'VIP') {
        vipOrdersSkipped++;
        continue;
      }

      // Trích xuất danh sách ID truyện từ đơn hàng
      const bookIdsToGrant = new Set();

      // Nguồn 1: từ items JSONB (nếu có)
      if (Array.isArray(order.items) && order.items.length > 0) {
        for (const item of order.items) {
          const bId = parseInt(item.id || item.book_id, 10);
          if (!isNaN(bId) && validBookIds.has(bId)) {
            bookIdsToGrant.add(bId);
          }
        }
      }

      // Nguồn 2: từ cột books (chuỗi dạng '21,27' hoặc '58')
      if (booksStr && booksStr !== 'null' && booksStr !== 'undefined') {
        const parts = booksStr.split(',');
        for (const part of parts) {
          const bId = parseInt(part.trim(), 10);
          if (!isNaN(bId) && validBookIds.has(bId)) {
            bookIdsToGrant.add(bId);
          }
        }
      }

      const orderRef = order.order_id || order.order_code || `ORD-${order.id}`;
      const purchasedAt = order.paid_at || order.created_at || new Date();

      for (const bookId of bookIdsToGrant) {
        const insertRes = await client.query(`
          INSERT INTO user_purchases (telegram_id, book_id, order_id, purchased_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (telegram_id, book_id) DO NOTHING
        `, [telegramId, bookId, orderRef, purchasedAt]);

        if (insertRes.rowCount > 0) {
          insertedPurchases++;
        } else {
          skippedPurchases++;
        }
      }
    }

    await client.query('COMMIT');

    // 3. Kiểm tra số liệu thực tế sau khi backfill
    const finalCountRes = await client.query('SELECT COUNT(*) as count FROM user_purchases');
    const finalUserCountRes = await client.query('SELECT COUNT(*) as count FROM users');

    console.log('\n================ BÁO CÁO KẾT QUẢ ĐỒNG BỘ ================');
    console.log(`✅ Tổng số đơn hàng xử lý: ${orders.length}`);
    console.log(`👥 Tổng số khách hàng cập nhật vào users: ${usersProcessed.size}`);
    console.log(`👑 Số đơn VIP bỏ qua (giữ nguyên bảng vip): ${vipOrdersSkipped}`);
    console.log(`📥 Số lượt truyện mới chèn vào user_purchases: ${insertedPurchases}`);
    console.log(`⏭️  Số lượt truyện đã có sẵn (bỏ qua trùng): ${skippedPurchases}`);
    console.log(`📚 Tổng số bản ghi hiện tại trong user_purchases: ${finalCountRes.rows[0].count}`);
    console.log(`👤 Tổng số người dùng trong bảng users: ${finalUserCountRes.rows[0].count}`);
    console.log('=========================================================\n');

    return {
      success: true,
      ordersProcessed: orders.length,
      usersUpdated: usersProcessed.size,
      insertedPurchases,
      skippedPurchases,
      totalPurchases: finalCountRes.rows[0].count
    };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi thực hiện backfill:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Nếu gọi trực tiếp từ command line
if (require.main === module) {
  backfillPurchases()
    .then(() => {
      console.log('🎉 Hoàn tất quá trình đồng bộ Tủ truyện thành công!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Thất bại:', err);
      process.exit(1);
    });
}

module.exports = backfillPurchases;
