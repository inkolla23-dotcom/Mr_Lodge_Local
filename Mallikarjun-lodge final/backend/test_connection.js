require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Indhu@230907',
    database: process.env.DB_NAME || 'mallikarjun_lodge',
    ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
  };

  try {
    console.log(`Attempting to connect to MySQL server at ${config.host}:${config.port}...`);
    const connection = await mysql.createConnection(config);
    console.log('Successfully connected to MySQL server!');
    
    console.log(`Verifying database "${config.database}"...`);
    const [rows] = await connection.query('SELECT 1 + 1 AS solution');
    console.log('Database query successful! Solution:', rows[0].solution);
    
    await connection.end();
  } catch (error) {
    console.error('Error connecting to MySQL:', error);
    process.exit(1);
  }
}

testConnection();
