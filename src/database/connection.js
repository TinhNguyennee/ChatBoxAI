const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/env');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 10000, // Đóng kết nối nhàn rỗi sau 10s để Neon Endpoint tự động ngủ (Scale to 0)
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('❌ Lỗi kết nối PostgreSQL Pool:', err.message);
});

module.exports = pool;
