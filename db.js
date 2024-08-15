const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'p2p',
  password: 'chemical',
  port: 5432,
});

module.exports = pool;
