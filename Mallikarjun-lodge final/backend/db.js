require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Indhu@230907',
  database: process.env.DB_NAME || 'mallikarjun_lodge',
  ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDB() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Successfully connected to database pool.');

    // 1. users table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role ENUM('Owner', 'Admin', 'Staff') NOT NULL DEFAULT 'Staff',
        status ENUM('pending', 'approved') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. rooms table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_number VARCHAR(10) UNIQUE NOT NULL,
        floor INT NOT NULL,
        room_type ENUM('Single', 'Double') NOT NULL,
        ac_type ENUM('AC', 'Non AC') NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        status ENUM('Available', 'Occupied', 'Reserved', 'Cleaning', 'Maintenance') NOT NULL DEFAULT 'Available'
      )
    `);

    // 3. customers table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mobile VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        age INT NOT NULL,
        gender ENUM('Male', 'Female', 'Other') NOT NULL,
        occupation VARCHAR(255) NOT NULL,
        nationality VARCHAR(255) NOT NULL DEFAULT 'Indian',
        address TEXT,
        aadhaar VARCHAR(12) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. bookings table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        customer_id INT NOT NULL,
        check_in VARCHAR(50) NOT NULL,
        check_out VARCHAR(50) NULL,
        stay_duration VARCHAR(50) NOT NULL,
        num_persons INT NOT NULL DEFAULT 1,
        purpose VARCHAR(255) NOT NULL DEFAULT 'Work',
        arriving_from VARCHAR(255) NOT NULL,
        mode_of_travel VARCHAR(255) NOT NULL DEFAULT 'Bus',
        remarks TEXT,
        num_gents INT NOT NULL DEFAULT 0,
        num_ladies INT NOT NULL DEFAULT 0,
        num_children INT NOT NULL DEFAULT 0,
        status ENUM('active', 'checked_out') NOT NULL DEFAULT 'active',
        invoice_number VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);

    // 5. additional_guests table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS additional_guests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        id_type VARCHAR(50) NOT NULL,
        id_number VARCHAR(50) NOT NULL,
        front_id VARCHAR(555) NULL,
        back_id VARCHAR(555) NULL,
        guest_photo VARCHAR(555) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      )
    `);

    // 6. customer_documents table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customer_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        customer_id INT NOT NULL,
        front_id VARCHAR(555) NULL,
        back_id VARCHAR(555) NULL,
        guest_photo VARCHAR(555) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);

    // 7. invoices table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        booking_id INT NOT NULL,
        room_charges DECIMAL(10,2) NOT NULL,
        gst_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
        paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
        status ENUM('paid', 'partial', 'unpaid') NOT NULL DEFAULT 'unpaid',
        created_at VARCHAR(50) NOT NULL,
        checked_out_at VARCHAR(50) NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      )
    `);

    // 8. invoice_items table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number) ON DELETE CASCADE
      )
    `);

    // 9. payments table — source of truth for all payment history
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        method VARCHAR(50) NOT NULL DEFAULT 'Cash',
        timestamp VARCHAR(50) NOT NULL,
        created_by VARCHAR(255) NOT NULL DEFAULT 'system',
        FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number) ON DELETE CASCADE
      )
    `);

    // Migrate: add created_by to payments if it doesn't exist yet
    try {
      await conn.query(`ALTER TABLE payments ADD COLUMN created_by VARCHAR(255) NOT NULL DEFAULT 'system'`);
      console.log('Migration: added created_by to payments table');
    } catch (alterErr) {
      // Column already exists — fine
    }

    // Migrate: add company_name to bookings if it doesn't exist yet
    try {
      await conn.query(`ALTER TABLE bookings ADD COLUMN company_name VARCHAR(255) NULL`);
      console.log('Migration: added company_name to bookings table');
    } catch (alterErr) {
      // Already exists
    }

    // Migrate: add company_gst to bookings if it doesn't exist yet
    try {
      await conn.query(`ALTER TABLE bookings ADD COLUMN company_gst VARCHAR(50) NULL`);
      console.log('Migration: added company_gst to bookings table');
    } catch (alterErr) {
      // Already exists
    }

    // Migrate: add id_type to bookings if it doesn't exist yet
    try {
      await conn.query(`ALTER TABLE bookings ADD COLUMN id_type VARCHAR(50) NULL`);
      console.log('Migration: added id_type to bookings table');
    } catch (alterErr) {
      // Already exists
    }

    // 10. reviews table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rating INT NOT NULL,
        review_text TEXT NOT NULL,
        created_at VARCHAR(50) NOT NULL
      )
    `);

    // 11. activity_logs table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT NOT NULL,
        timestamp VARCHAR(50) NOT NULL
      )
    `);

    // 12. app_settings table — stores configurable system settings (e.g. log delete password)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Seed default log delete password: mrlodge@2026 (stored as bcrypt hash)
    const [existingPwd] = await conn.query("SELECT * FROM app_settings WHERE setting_key = 'log_delete_password'");
    if (existingPwd.length === 0) {
      const defaultHash = await bcrypt.hash('mrlodge@2026', 10);
      await conn.query(
        "INSERT INTO app_settings (setting_key, setting_value) VALUES ('log_delete_password', ?)",
        [defaultHash]
      );
      console.log('Default log delete password seeded: mrlodge@2026');
    }

    // Safe migrations: add G/L/C columns to existing bookings table if not present
    const alterCols = [
      "ALTER TABLE bookings ADD COLUMN num_gents INT NOT NULL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN num_ladies INT NOT NULL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN num_children INT NOT NULL DEFAULT 0",
    ];
    for (const sql of alterCols) {
      try { await conn.query(sql); }
      catch { /* column already exists — ok */ }
    }

    console.log('All database tables verified/created.');

    // Seed default Owner if not exists
    const [existingOwner] = await conn.query('SELECT * FROM users WHERE email = ?', ['mrlodge26@gmail.com']);
    if (existingOwner.length === 0) {
      const hashedPassword = await bcrypt.hash('mrlodge@2026', 10);
      await conn.query(`
        INSERT INTO users (email, password, name, role, status)
        VALUES (?, ?, ?, 'Owner', 'approved')
      `, ['mrlodge26@gmail.com', hashedPassword, 'Mallikarjun']);
      console.log('Default Owner seeded: mrlodge26@gmail.com / mrlodge@2026');
    }

    // Seed initial rooms structure if rooms table is empty
    const [existingRooms] = await conn.query('SELECT COUNT(*) as count FROM rooms');
    if (existingRooms[0].count === 0) {
      console.log('Seeding initial room structure...');
      const roomsData = [
        // Floor 1
        { num: '101', floor: 1, type: 'Single', ac: 'Non AC', price: 500 },
        { num: '102', floor: 1, type: 'Double', ac: 'AC', price: 1200 },
        { num: '103', floor: 1, type: 'Double', ac: 'AC', price: 1200 },
        { num: '104', floor: 1, type: 'Double', ac: 'AC', price: 1200 },
        { num: '105', floor: 1, type: 'Double', ac: 'Non AC', price: 900 },
        { num: '106', floor: 1, type: 'Single', ac: 'Non AC', price: 500 },
        // Floor 2
        { num: '201', floor: 2, type: 'Single', ac: 'Non AC', price: 500 },
        { num: '202', floor: 2, type: 'Double', ac: 'Non AC', price: 900 },
        { num: '203', floor: 2, type: 'Double', ac: 'Non AC', price: 900 },
        { num: '204', floor: 2, type: 'Double', ac: 'AC', price: 1200 },
        { num: '205', floor: 2, type: 'Double', ac: 'Non AC', price: 900 },
        { num: '206', floor: 2, type: 'Single', ac: 'Non AC', price: 500 },
        // Floor 3
        { num: '301', floor: 3, type: 'Single', ac: 'Non AC', price: 500 },
        { num: '302', floor: 3, type: 'Double', ac: 'AC', price: 1200 },
        { num: '303', floor: 3, type: 'Double', ac: 'Non AC', price: 900 },
        { num: '304', floor: 3, type: 'Double', ac: 'AC', price: 1200 },
        { num: '305', floor: 3, type: 'Double', ac: 'Non AC', price: 900 },
        { num: '306', floor: 3, type: 'Single', ac: 'Non AC', price: 500 },
        // Floor 4
        { num: '401', floor: 4, type: 'Single', ac: 'Non AC', price: 500 },
        { num: '402', floor: 4, type: 'Double', ac: 'AC', price: 1200 },
        { num: '403', floor: 4, type: 'Double', ac: 'AC', price: 1200 },
        { num: '404', floor: 4, type: 'Double', ac: 'AC', price: 1200 },
        { num: '405', floor: 4, type: 'Double', ac: 'Non AC', price: 900 },
        { num: '406', floor: 4, type: 'Single', ac: 'Non AC', price: 500 },
        // Floor 5
        { num: '501', floor: 5, type: 'Single', ac: 'Non AC', price: 500 },
      ];

      for (const room of roomsData) {
        await conn.query(`
          INSERT INTO rooms (room_number, floor, room_type, ac_type, price, status)
          VALUES (?, ?, ?, ?, ?, 'Available')
        `, [room.num, room.floor, room.type, room.ac, room.price]);
      }
      console.log('Room structure seeded (including Floor 5 Room 501).');
    }

  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  pool,
  initDB
};
