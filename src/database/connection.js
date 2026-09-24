const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/env');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('❌ Lỗi kết nối PostgreSQL Pool:', err.message);
});

module.exports = pool;
