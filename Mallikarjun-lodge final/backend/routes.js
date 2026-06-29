const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'mrlodge_secret_key_2026_xyz';

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsDir); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

// Helper to save webcam base64 images
function saveBase64Image(base64Data, prefix = 'webcam') {
  if (!base64Data || typeof base64Data !== 'string') return null;
  if (base64Data.startsWith('/uploads/') || base64Data.startsWith('http')) return base64Data;

  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;

  const ext = matches[1].split('/')[1] || 'png';
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

// Auth middleware
// Returns 401 for missing token, 401 for expired token, 403 for malformed/invalid signature.
// Frontend intercepts 401 to show "Session expired" and redirect to login.
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(/\s+/)[1];

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ message: 'Session expired. Please login again.', code: 'TOKEN_MISSING' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // TokenExpiredError → session expired (user must log in again)
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Session expired. Please login again.', code: 'TOKEN_EXPIRED' });
      }
      // JsonWebTokenError, NotBeforeError → bad token (tampered or wrong secret)
      return res.status(401).json({ message: 'Session expired. Please login again.', code: 'TOKEN_INVALID' });
    }
    req.user = user;
    next();
  });
}

// Activity logger
async function logActivity(email, action, details) {
  try {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    await pool.query(
      'INSERT INTO activity_logs (email, action, details, timestamp) VALUES (?, ?, ?, ?)',
      [email || 'Guest', action, details, timestamp]
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// ─── Helper: Compute grand total for an invoice (room + extras + gst) ─────
async function computeGrandTotal(invoice_number, room_charges, gst_rate) {
  const [items] = await pool.query('SELECT SUM(amount) as extras FROM invoice_items WHERE invoice_number = ?', [invoice_number]);
  const extras = parseFloat(items[0].extras || 0);
  const rc = parseFloat(room_charges);
  const subtotal = rc + extras;
  const grandTotal = subtotal + subtotal * (parseFloat(gst_rate) / 100);
  return { grandTotal, extras, subtotal };
}

// ─── Helper: Recompute paid_amount from payments table and update invoice ─
async function syncInvoicePaidAmount(invoice_number, conn) {
  const db = conn || pool;
  const [sumRow] = await db.query(
    'SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE invoice_number = ?',
    [invoice_number]
  );
  const totalPaid = parseFloat(sumRow[0].total);

  // Get invoice to know grand total
  const [invRow] = await db.query('SELECT room_charges, gst_rate FROM invoices WHERE invoice_number = ?', [invoice_number]);
  if (!invRow.length) return;
  const { grandTotal } = await computeGrandTotal(invoice_number, invRow[0].room_charges, invRow[0].gst_rate);

  let status = 'unpaid';
  if (totalPaid >= grandTotal - 0.01) status = 'paid';
  else if (totalPaid > 0) status = 'partial';

  await db.query(
    'UPDATE invoices SET paid_amount = ?, status = ? WHERE invoice_number = ?',
    [totalPaid, status, invoice_number]
  );
  return totalPaid;
}

// Centralized checkout function within a transaction
async function executeCheckoutInTransaction(conn, bookingId, checkoutTime, destinationRoomStatus, userEmail) {
  // 1. Get booking details
  const [bookingRows] = await conn.query('SELECT room_id, invoice_number, status FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
  if (bookingRows.length === 0) throw new Error('Booking not found');
  const booking = bookingRows[0];
  
  if (booking.status === 'checked_out') {
    return booking; // Already checked out, skip
  }

  // 2. Update booking status
  await conn.query("UPDATE bookings SET status = 'checked_out', check_out = ? WHERE id = ?", [checkoutTime, bookingId]);

  // 3. Update invoice checkout timestamp
  await conn.query('UPDATE invoices SET checked_out_at = ? WHERE invoice_number = ?', [checkoutTime, booking.invoice_number]);

  // 4. Update room status to destinationRoomStatus
  await conn.query("UPDATE rooms SET status = ? WHERE id = ?", [destinationRoomStatus, booking.room_id]);

  // 5. Log activity (Only one event logged)
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  await conn.query(
    'INSERT INTO activity_logs (email, action, details, timestamp) VALUES (?, ?, ?, ?)',
    [userEmail || 'system', 'Checkout', `Checked out Invoice ${booking.invoice_number}. Room → ${destinationRoomStatus}.`, timestamp]
  );

  return booking;
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

router.post('/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: 'All fields are required' });
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ message: 'Email already registered' });
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (email, password, name, role, status) VALUES (?, ?, ?, 'Staff', 'pending')",
      [email, hashedPassword, name]
    );
    await logActivity('system', 'User Access Changes', `New user registration request: ${email} (${name})`);
    res.json({ message: 'Access request submitted. Awaiting approval.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'All fields are required' });
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(400).json({ message: 'Invalid credentials' });
    const user = users[0];
    if (user.status !== 'approved') return res.status(403).json({ message: 'Your registration request is pending approval.' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    await logActivity(user.email, 'Login', `User ${user.email} logged in successfully`);
    res.json({ token, user: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/auth/logout', authenticateToken, async (req, res) => {
  await logActivity(req.user.email, 'Logout', `User logged out`);
  res.json({ message: 'Logged out successfully' });
});

router.get('/auth/all-users', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, name, role, status, created_at FROM users');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/auth/approve-user', authenticateToken, async (req, res) => {
  const { userId, role, status } = req.body;
  try {
    const [userRow] = await pool.query('SELECT email, name FROM users WHERE id = ?', [userId]);
    if (userRow.length === 0) return res.status(404).json({ message: 'User not found' });
    await pool.query('UPDATE users SET role = ?, status = ? WHERE id = ?', [role, status, userId]);
    await logActivity(req.user.email, 'User Access Changes', `Approved/Updated user ${userRow[0].email} to ${role} (${status})`);
    res.json({ message: 'User approved/updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/auth/remove-user', authenticateToken, async (req, res) => {
  const { userId } = req.body;
  try {
    const [userRow] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    if (userRow.length === 0) return res.status(404).json({ message: 'User not found' });
    if (userRow[0].email === 'mrlodge26@gmail.com') return res.status(400).json({ message: 'Cannot delete the primary owner account.' });
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    await logActivity(req.user.email, 'User Access Changes', `Removed user ${userRow[0].email}`);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// ROOMS ROUTES
// ==========================================

router.get('/rooms', async (req, res) => {
  try {
    const [rooms] = await pool.query('SELECT * FROM rooms ORDER BY floor ASC, room_number ASC');
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/rooms', authenticateToken, async (req, res) => {
  const { room_number, floor, room_type, ac_type, price, status } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM rooms WHERE room_number = ?', [room_number]);
    if (existing.length > 0) return res.status(400).json({ message: 'Room number already exists' });
    await pool.query(
      'INSERT INTO rooms (room_number, floor, room_type, ac_type, price, status) VALUES (?, ?, ?, ?, ?, ?)',
      [room_number, floor, room_type, ac_type, price, status || 'Available']
    );
    await logActivity(req.user.email, 'Room Changes', `Added room ${room_number}`);
    res.json({ message: 'Room added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/rooms/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { room_number, floor, room_type, ac_type, price, status } = req.body;
  try {
    await pool.query(
      'UPDATE rooms SET room_number = ?, floor = ?, room_type = ?, ac_type = ?, price = ?, status = ? WHERE id = ?',
      [room_number, floor, room_type, ac_type, price, status, id]
    );
    await logActivity(req.user.email, 'Room Changes', `Updated room ${room_number} details`);
    res.json({ message: 'Room updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/rooms/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { force } = req.query; // ?force=true to cascade-delete all related data

  try {
    const [room] = await pool.query('SELECT room_number FROM rooms WHERE id = ?', [id]);
    if (room.length === 0) return res.status(404).json({ message: 'Room not found' });
    const roomNumber = room[0].room_number;

    // Get all bookings for this room
    const [bookings] = await pool.query('SELECT id, invoice_number FROM bookings WHERE room_id = ?', [id]);

    if (bookings.length > 0 && force !== 'true') {
      // Return info so frontend can show a confirmation modal
      return res.status(409).json({
        message: 'Room has existing bookings and records.',
        bookingCount: bookings.length,
        requiresForce: true
      });
    }

    // Cascade-delete all related records in correct FK order
    for (const booking of bookings) {
      // Delete payments for this booking's invoice
      if (booking.invoice_number) {
        await pool.query('DELETE FROM payments WHERE invoice_number = ?', [booking.invoice_number]);
        await pool.query('DELETE FROM invoice_items WHERE invoice_number = ?', [booking.invoice_number]);
        await pool.query('DELETE FROM invoices WHERE invoice_number = ?', [booking.invoice_number]);
      }
      // Delete customer documents and additional guests (cascade should handle, but explicit is safer)
      await pool.query('DELETE FROM customer_documents WHERE booking_id = ?', [booking.id]);
      await pool.query('DELETE FROM additional_guests WHERE booking_id = ?', [booking.id]);
    }

    // Delete all bookings for this room
    if (bookings.length > 0) {
      await pool.query('DELETE FROM bookings WHERE room_id = ?', [id]);
    }

    // Finally delete the room
    await pool.query('DELETE FROM rooms WHERE id = ?', [id]);
    await logActivity(req.user.email, 'Room Changes', `Deleted room ${roomNumber} and all ${bookings.length} associated booking(s) and records.`);
    res.json({ message: `Room ${roomNumber} and all associated records deleted successfully.` });
  } catch (err) {
    console.error('Room delete error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

router.put('/rooms/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get current room status
    const [roomRow] = await conn.query('SELECT room_number, status FROM rooms WHERE id = ? FOR UPDATE', [id]);
    if (roomRow.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Room not found' });
    }
    const currentRoom = roomRow[0];

    // If changing from Occupied to a non-Occupied status, trigger checkout!
    if (currentRoom.status === 'Occupied' && status !== 'Occupied') {
      const [bookingRow] = await conn.query(
        "SELECT id FROM bookings WHERE room_id = ? AND status = 'active' FOR UPDATE",
        [id]
      );
      if (bookingRow.length > 0) {
        const bookingId = bookingRow[0].id;
        const checkoutTime = new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        }).replace(/,/g, '');

        await executeCheckoutInTransaction(conn, bookingId, checkoutTime, status, req.user.email);
      }
    }

    await conn.query('UPDATE rooms SET status = ? WHERE id = ?', [status, id]);
    await conn.commit();

    await logActivity(req.user.email, 'Room Changes', `Changed room ${currentRoom.room_number} status to ${status}`);
    res.json({ message: 'Room status updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Room status update failed:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// CUSTOMERS ROUTES
// ==========================================

router.get('/customers/:mobile', async (req, res) => {
  const { mobile } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM customers WHERE mobile = ?', [mobile]);
    if (rows.length === 0) return res.status(404).json({ message: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// CHECK-IN & BOOKINGS ROUTES
// ==========================================

// Accept: primary front/back files + per-guest indexed files
const checkinUpload = upload.fields([
  { name: 'front_id', maxCount: 1 },
  { name: 'back_id', maxCount: 1 },
  // Additional guests: guest_front_0, guest_back_0, guest_photo_0, guest_front_1 ...
  ...Array.from({ length: 10 }, (_, i) => [
    { name: `guest_front_${i}`, maxCount: 1 },
    { name: `guest_back_${i}`, maxCount: 1 },
    { name: `guest_photo_${i}`, maxCount: 1 },
  ]).flat()
]);

router.post('/bookings/check-in', authenticateToken, checkinUpload, async (req, res) => {
  let {
    room_id, mobile, name, age, gender, occupation, nationality, address, aadhaar, id_type,
    stay_duration, num_persons, purpose, arriving_from, mode_of_travel, remarks,
    num_gents, num_ladies, num_children,
    webcam_front_id, webcam_back_id, webcam_guest_photo,
    additional_guests
  } = req.body;

  try {
    // 1. Upsert Customer
    const [existingCust] = await pool.query('SELECT id FROM customers WHERE mobile = ?', [mobile]);
    let customerId;
    if (existingCust.length > 0) {
      customerId = existingCust[0].id;
      await pool.query(
        `UPDATE customers SET name=?, age=?, gender=?, occupation=?, nationality=?, address=?, aadhaar=? WHERE id=?`,
        [name, age, gender, occupation, nationality || 'Indian', address || '', aadhaar, customerId]
      );
    } else {
      const [insertCust] = await pool.query(
        `INSERT INTO customers (mobile,name,age,gender,occupation,nationality,address,aadhaar) VALUES (?,?,?,?,?,?,?,?)`,
        [mobile, name, age, gender, occupation, nationality || 'Indian', address || '', aadhaar]
      );
      customerId = insertCust.insertId;
    }

    // 2. Resolve primary documents
    let frontIdPath = '';
    let backIdPath = '';
    let guestPhotoPath = '';

    if (req.files && req.files['front_id']) {
      frontIdPath = `/uploads/${req.files['front_id'][0].filename}`;
    } else if (webcam_front_id) {
      frontIdPath = saveBase64Image(webcam_front_id, 'front_id') || '';
    }

    if (req.files && req.files['back_id']) {
      backIdPath = `/uploads/${req.files['back_id'][0].filename}`;
    } else if (webcam_back_id) {
      backIdPath = saveBase64Image(webcam_back_id, 'back_id') || '';
    }

    if (webcam_guest_photo) {
      guestPhotoPath = saveBase64Image(webcam_guest_photo, 'guest_photo') || '';
    }

    // 3. Create Booking
    const checkinTime = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).replace(/,/g, '');

    const currentYear = new Date().getFullYear().toString().slice(-2);
    const [invoiceSeqRow] = await pool.query('SELECT COUNT(*) as count FROM invoices');
    const invoiceSeq = (invoiceSeqRow[0].count + 10001).toString();
    const invoiceNumber = `MR-${currentYear}-${invoiceSeq}`;

    const [bookingInsert] = await pool.query(
      `INSERT INTO bookings (room_id,customer_id,check_in,stay_duration,num_persons,purpose,arriving_from,mode_of_travel,remarks,num_gents,num_ladies,num_children,status,invoice_number)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',?)`,
      [room_id, customerId, checkinTime, stay_duration, num_persons||1, purpose||'Work', arriving_from, mode_of_travel||'Bus', remarks||'',
       parseInt(num_gents)||0, parseInt(num_ladies)||0, parseInt(num_children)||0, invoiceNumber]
    );
    const bookingId = bookingInsert.insertId;

    // 4. Save primary customer documents
    await pool.query(
      `INSERT INTO customer_documents (booking_id,customer_id,front_id,back_id,guest_photo) VALUES (?,?,?,?,?)`,
      [bookingId, customerId, frontIdPath, backIdPath, guestPhotoPath]
    );

    // 5. Save Additional Guests
    if (additional_guests) {
      const parsedGuests = JSON.parse(additional_guests);
      for (let i = 0; i < parsedGuests.length; i++) {
        const guest = parsedGuests[i];

        // Prefer uploaded files, fall back to webcam base64 in JSON
        let addFrontPath = '';
        let addBackPath = '';
        let addPhotoPath = '';

        if (req.files && req.files[`guest_front_${i}`]) {
          addFrontPath = `/uploads/${req.files[`guest_front_${i}`][0].filename}`;
        } else if (guest.webcam_front_id) {
          addFrontPath = saveBase64Image(guest.webcam_front_id, `add_front_${i}`) || '';
        }

        if (req.files && req.files[`guest_back_${i}`]) {
          addBackPath = `/uploads/${req.files[`guest_back_${i}`][0].filename}`;
        } else if (guest.webcam_back_id) {
          addBackPath = saveBase64Image(guest.webcam_back_id, `add_back_${i}`) || '';
        }

        if (req.files && req.files[`guest_photo_${i}`]) {
          addPhotoPath = `/uploads/${req.files[`guest_photo_${i}`][0].filename}`;
        } else if (guest.webcam_guest_photo) {
          addPhotoPath = saveBase64Image(guest.webcam_guest_photo, `add_photo_${i}`) || '';
        }

        await pool.query(
          `INSERT INTO additional_guests (booking_id,name,id_type,id_number,front_id,back_id,guest_photo)
           VALUES (?,?,?,?,?,?,?)`,
          [bookingId, guest.name, guest.id_type||'Aadhaar', guest.id_number, addFrontPath, addBackPath, addPhotoPath]
        );
      }
    }

    // 6. Create Invoice (paid_amount starts at 0 — payments table is source of truth)
    const [roomRow] = await pool.query('SELECT price, room_number FROM rooms WHERE id = ?', [room_id]);
    const roomCharges = roomRow[0].price;

    await pool.query(
      `INSERT INTO invoices (invoice_number,booking_id,room_charges,gst_rate,paid_amount,payment_method,status,created_at)
       VALUES (?,?,?,5.00,0.00,'Cash','unpaid',?)`,
      [invoiceNumber, bookingId, roomCharges, checkinTime]
    );

    // 7. Update Room Status
    await pool.query("UPDATE rooms SET status = 'Occupied' WHERE id = ?", [room_id]);

    await logActivity(req.user.email, 'Check-In', `Check-in: ${name} → Room ${roomRow[0].room_number}. Invoice: ${invoiceNumber}`);
    res.json({ message: 'Check-in successful', bookingId, invoiceNumber });
  } catch (err) {
    console.error('Check-in failed:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

router.get('/bookings', async (req, res) => {
  const { status } = req.query;
  try {
    let query = `
      SELECT b.*, r.room_number, r.room_type, r.ac_type, r.price, c.name as guest_name, c.mobile
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN customers c ON b.customer_id = c.id
    `;
    const params = [];
    if (status && status !== 'all') {
      query += ' WHERE b.status = ?';
      params.push(status);
    }
    query += ' ORDER BY b.id DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// INVOICES ROUTES
// ==========================================

router.get('/invoices', async (req, res) => {
  const { status, search } = req.query;
  try {
    let query = `
      SELECT
        i.*,
        b.check_in, b.check_out,
        r.room_number,
        c.name as guest_name, c.mobile,
        COALESCE((
          SELECT SUM(ii.amount) FROM invoice_items ii WHERE ii.invoice_number = i.invoice_number
        ), 0) as extras_total,
        COALESCE((
          SELECT SUM(p.amount) FROM payments p WHERE p.invoice_number = i.invoice_number
        ), 0) as real_paid_amount
      FROM invoices i
      JOIN bookings b ON i.booking_id = b.id
      JOIN rooms r ON b.room_id = r.id
      JOIN customers c ON b.customer_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (status && status !== 'all') {
      conditions.push('i.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR c.mobile LIKE ? OR r.room_number LIKE ?)');
      const match = `%${search}%`;
      params.push(match, match, match, match);
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY i.id DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/invoices/:invoice_number', async (req, res) => {
  const { invoice_number } = req.params;
  try {
    const [invoiceRow] = await pool.query('SELECT * FROM invoices WHERE invoice_number = ?', [invoice_number]);
    if (invoiceRow.length === 0) return res.status(404).json({ message: 'Invoice not found' });
    const invoice = invoiceRow[0];

    const [bookingRow] = await pool.query(`
      SELECT b.*, r.room_number, r.room_type, r.ac_type
      FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.id = ?
    `, [invoice.booking_id]);
    const booking = bookingRow[0];

    const [custRow] = await pool.query('SELECT * FROM customers WHERE id = ?', [booking.customer_id]);
    const customer = custRow[0];

    const [docRow] = await pool.query('SELECT * FROM customer_documents WHERE booking_id = ?', [invoice.booking_id]);
    const documents = docRow[0] || {};

    const [addGuests] = await pool.query('SELECT * FROM additional_guests WHERE booking_id = ?', [invoice.booking_id]);
    const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_number = ?', [invoice_number]);

    // Payments from payments table — the single source of truth
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE invoice_number = ? ORDER BY id ASC',
      [invoice_number]
    );

    res.json({ invoice, booking, customer, documents, additional_guests: addGuests, items, payments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /invoices/:invoice_number
// Body: { room_charges, gst_rate, extra_charges[], new_payment?: { amount, method } }
// NEVER re-sends the full payments array to avoid double counting.
// Only sends a single new_payment transaction when owner adds money.
router.put('/invoices/:invoice_number', authenticateToken, async (req, res) => {
  const { invoice_number } = req.params;
  const { room_charges, gst_rate, extra_charges, new_payment } = req.body;

  try {
    const [invRow] = await pool.query('SELECT booking_id FROM invoices WHERE invoice_number = ?', [invoice_number]);
    if (invRow.length === 0) return res.status(404).json({ message: 'Invoice not found' });

    // 1. Update room charges and GST on invoice
    await pool.query(
      'UPDATE invoices SET room_charges = ?, gst_rate = ? WHERE invoice_number = ?',
      [room_charges, gst_rate, invoice_number]
    );

    // 2. Replace extra charges
    await pool.query('DELETE FROM invoice_items WHERE invoice_number = ?', [invoice_number]);
    if (extra_charges && Array.isArray(extra_charges)) {
      for (const item of extra_charges) {
        await pool.query(
          'INSERT INTO invoice_items (invoice_number, description, amount) VALUES (?, ?, ?)',
          [invoice_number, item.description, parseFloat(item.amount)]
        );
      }
    }

    // 3. Insert new payment transaction ONLY if provided
    //    This is the ONLY way paid_amount grows — no overwriting, no re-sending array
    if (new_payment && parseFloat(new_payment.amount) > 0) {
      const timestamp = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }).replace(/,/g, '');

      await pool.query(
        'INSERT INTO payments (invoice_number, amount, method, timestamp, created_by) VALUES (?, ?, ?, ?, ?)',
        [invoice_number, parseFloat(new_payment.amount), new_payment.method || 'Cash', timestamp, req.user.email]
      );
    }

    // 4. Sync paid_amount on invoices table from payments table (prevents all double-counting)
    const totalPaid = await syncInvoicePaidAmount(invoice_number);

    // Compute grand total to determine status
    const [updatedInv] = await pool.query('SELECT room_charges, gst_rate FROM invoices WHERE invoice_number = ?', [invoice_number]);
    const { grandTotal } = await computeGrandTotal(invoice_number, updatedInv[0].room_charges, updatedInv[0].gst_rate);

    let status = 'unpaid';
    if (totalPaid >= grandTotal - 0.01) status = 'paid';
    else if (totalPaid > 0) status = 'partial';

    await pool.query('UPDATE invoices SET status = ? WHERE invoice_number = ?', [status, invoice_number]);

    await logActivity(req.user.email, 'Invoice Changes', `Updated invoice ${invoice_number}. Grand Total: ₹${grandTotal.toFixed(2)}, Paid: ₹${totalPaid.toFixed(2)}`);
    res.json({ message: 'Invoice updated successfully', totalPaid, grandTotal, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

router.post('/bookings/:id/checkout', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const checkoutTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).replace(/,/g, '');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Note: Room status becomes 'Available' when checked out from the invoice/bookings page
    // as requested: "Room status must become Available"
    const booking = await executeCheckoutInTransaction(conn, id, checkoutTime, 'Available', req.user.email);

    await conn.commit();
    res.json({ message: 'Checkout successful', bookingId: id, invoiceNumber: booking.invoice_number });
  } catch (err) {
    await conn.rollback();
    console.error('Checkout failed:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// REVIEWS ROUTES
// ==========================================

router.post('/reviews', async (req, res) => {
  const { rating, review_text } = req.body;
  if (!rating || !review_text) return res.status(400).json({ message: 'Rating and review text are required' });
  try {
    const submitDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    await pool.query('INSERT INTO reviews (rating, review_text, created_at) VALUES (?, ?, ?)', [rating, review_text, submitDate]);
    res.json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/reviews', async (req, res) => {
  try {
    const [reviews] = await pool.query('SELECT * FROM reviews ORDER BY id DESC');
    const [avgRow] = await pool.query('SELECT AVG(rating) as avgRating, COUNT(*) as count FROM reviews');
    res.json({ reviews, avgRating: parseFloat(avgRow[0].avgRating || 0).toFixed(1), count: avgRow[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/reviews/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM reviews WHERE id = ?', [id]);
    await logActivity(req.user.email, 'Review Deletions', `Deleted review ID ${id}`);
    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// LEDGER BOOK ROUTES
// ==========================================

router.get('/ledger', async (req, res) => {
  const { fromDate, toDate } = req.query;
  try {
    const [bookings] = await pool.query(`
      SELECT b.*, r.room_number, c.name, c.address, c.age, c.occupation, c.nationality,
             COALESCE(b.num_gents,0) as num_gents,
             COALESCE(b.num_ladies,0) as num_ladies,
             COALESCE(b.num_children,0) as num_children
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN customers c ON b.customer_id = c.id
      ORDER BY b.id ASC
    `);

    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const filtered = bookings.filter(b => {
      if (!fromDate || !toDate) return true;
      try {
        const parts = b.check_in.split(' ');
        const d = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]));
        const f = new Date(fromDate); const t = new Date(toDate);
        d.setHours(0,0,0,0); f.setHours(0,0,0,0); t.setHours(0,0,0,0);
        return d >= f && d <= t;
      } catch { return true; }
    });
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// REPORTS ROUTES
// ==========================================

router.get('/reports', async (req, res) => {
  const { fromDate, toDate } = req.query;
  try {
    const [invoices] = await pool.query('SELECT * FROM invoices');
    const [allBookings] = await pool.query(`SELECT b.*, r.price, r.room_number FROM bookings b JOIN rooms r ON b.room_id = r.id`);
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

    const isInRange = (dateStr) => {
      if (!fromDate || !toDate) return true;
      try {
        const parts = dateStr.split(' ');
        const d = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]));
        const f = new Date(fromDate); const t = new Date(toDate);
        d.setHours(0,0,0,0); f.setHours(0,0,0,0); t.setHours(0,0,0,0);
        return d >= f && d <= t;
      } catch { return true; }
    };

    const rangeInvoices = invoices.filter(i => isInRange(i.created_at));
    const rangeBookings = allBookings.filter(b => isInRange(b.check_in));

    // Revenue = sum of actual payments in range (from payments table)
    const invoiceNums = rangeInvoices.map(i => i.invoice_number);
    let totalRevenue = 0;
    const revenueByMethod = {};

    if (invoiceNums.length > 0) {
      const placeholders = invoiceNums.map(() => '?').join(',');
      const [paymentRows] = await pool.query(
        `SELECT method, SUM(amount) as total FROM payments WHERE invoice_number IN (${placeholders}) GROUP BY method`,
        invoiceNums
      );
      paymentRows.forEach(p => {
        revenueByMethod[p.method] = parseFloat(p.total);
        totalRevenue += parseFloat(p.total);
      });
    }

    const [roomsCountRow] = await pool.query('SELECT COUNT(*) as count FROM rooms');
    const totalRooms = roomsCountRow[0].count || 1;
    const occupiedRooms = allBookings.filter(b => b.status === 'active').length;
    const occupancyPercentage = Math.round((occupiedRooms / totalRooms) * 100);

    res.json({
      totalRevenue,
      totalBookings: rangeBookings.length,
      occupancyPercentage,
      revenueByMethod: Object.keys(revenueByMethod).map(method => ({ method, amount: revenueByMethod[method] }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// ACTIVITY LOGS ROUTES
// ==========================================

router.get('/activity-logs', async (req, res) => {
  try {
    const [logs] = await pool.query('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 150');
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/activity-logs', authenticateToken, async (req, res) => {
  const { action, details } = req.body;
  try {
    await logActivity(req.user.email, action, details);
    res.json({ message: 'Logged' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// DATA MANAGEMENT
// ==========================================

router.post('/data-management/delete-records', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Owner' && req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin or Owner privileges required' });
  const { fromDate, toDate } = req.body;
  try {
    const [bookings] = await pool.query('SELECT id, check_in, invoice_number FROM bookings');
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const idsToDelete = [];
    const invoicesToDelete = [];

    bookings.forEach(b => {
      try {
        const parts = b.check_in.split(' ');
        const d = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]));
        const f = new Date(fromDate); const t = new Date(toDate);
        d.setHours(0,0,0,0); f.setHours(0,0,0,0); t.setHours(0,0,0,0);
        if (d >= f && d <= t) { idsToDelete.push(b.id); if (b.invoice_number) invoicesToDelete.push(b.invoice_number); }
      } catch {}
    });

    if (idsToDelete.length > 0) {
      for (const invNum of invoicesToDelete) await pool.query('DELETE FROM invoices WHERE invoice_number = ?', [invNum]);
      for (const bid of idsToDelete) await pool.query('DELETE FROM bookings WHERE id = ?', [bid]);
      await pool.query("UPDATE rooms SET status = 'Available'");
    }

    await logActivity(req.user.email, 'Data Deletions', `Deleted ${idsToDelete.length} bookings between ${fromDate} and ${toDate}`);
    res.json({ message: `Successfully deleted ${idsToDelete.length} bookings and invoices.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

router.post('/data-management/delete-logs', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Owner' && req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin or Owner privileges required' });
  try {
    await pool.query('DELETE FROM activity_logs');
    await logActivity(req.user.email, 'Data Deletions', `Cleared all activity logs`);
    res.json({ message: 'Activity logs deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ==========================================
// DATABASE BACKUP ROUTE (Owner / Admin only)
// ==========================================

// GET /api/backup/download
// Generates a complete SQL dump of all tables using the existing mysql2 connection pool.
// Does NOT require mysqldump binary — pure Node.js implementation.
router.get('/backup/download', authenticateToken, async (req, res) => {
  // Only Owner or Admin may download a backup
  if (req.user.role !== 'Owner' && req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Only Owner or Admin can download database backups.' });
  }

  const dbName = process.env.DB_NAME || 'mallikarjun_lodge';

  try {
    const lines = [];
    const now = new Date();

    // ── Header comment ──────────────────────────────────────────────────────
    lines.push(`-- MRLodge Database Backup`);
    lines.push(`-- Generated: ${now.toISOString()}`);
    lines.push(`-- Database: ${dbName}`);
    lines.push(`-- Generated By: ${req.user.email} (${req.user.role})`);
    lines.push(`--`);
    lines.push(`SET FOREIGN_KEY_CHECKS=0;`);
    lines.push(`SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';`);
    lines.push(`SET NAMES utf8mb4;`);
    lines.push(``);

    // ── Get all table names ─────────────────────────────────────────────────
    const [tables] = await pool.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0]; // e.g. "Tables_in_mallikarjun_lodge"

    for (const tableRow of tables) {
      const tableName = tableRow[tableKey];

      // CREATE TABLE statement
      const [[createRow]] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
      const createSql = createRow['Create Table'];

      lines.push(`-- --------------------------------------------------------`);
      lines.push(`-- Table: \`${tableName}\``);
      lines.push(`-- --------------------------------------------------------`);
      lines.push(``);
      lines.push(`DROP TABLE IF EXISTS \`${tableName}\`;`);
      lines.push(`${createSql};`);
      lines.push(``);

      // INSERT data
      const [rows] = await pool.query(`SELECT * FROM \`${tableName}\``);
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const colList = columns.map(c => `\`${c}\``).join(', ');

        // Batch inserts in groups of 50 for efficiency
        const batchSize = 50;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const valueStrings = batch.map(row => {
            const vals = columns.map(col => {
              const v = row[col];
              if (v === null || v === undefined) return 'NULL';
              if (typeof v === 'number') return v;
              if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
              // Escape single quotes and backslashes
              const escaped = String(v)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r');

return `'${escaped}'`;
            });
            return `(${vals.join(', ')})`;
          });
          lines.push(`INSERT INTO \`${tableName}\` (${colList}) VALUES`);
          lines.push(valueStrings.join(',\n') + ';');
        }
        lines.push(``);
      }
    }

    lines.push(`SET FOREIGN_KEY_CHECKS=1;`);
    lines.push(`-- End of backup`);

    const sqlContent = lines.join('\n');

    // ── Filename with timestamp ─────────────────────────────────────────────
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `MRLodge_Backup_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.sql`;

    // ── Log the activity ────────────────────────────────────────────────────
    await logActivity(req.user.email, 'System Backup', `Database backup downloaded: ${filename}`);

    // ── Stream as file download ─────────────────────────────────────────────
    const buf = Buffer.from(sqlContent, 'utf8');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);

  } catch (err) {
    console.error('Backup generation error:', err);
    res.status(500).json({ message: 'Unable to generate database backup. Please try again.' });
  }
});

// ==========================================
// APP SETTINGS ROUTES (Log Delete Password)
// ==========================================

// POST /api/settings/verify-log-password — verify the log-delete password (any authenticated user)
router.post('/settings/verify-log-password', authenticateToken, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Password required' });
  try {
    const [rows] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'log_delete_password'");
    if (rows.length === 0) return res.status(500).json({ message: 'Password not configured' });
    const match = await bcrypt.compare(password, rows[0].setting_value);
    if (!match) return res.status(403).json({ message: 'Incorrect password' });
    res.json({ verified: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/settings/log-delete-password — change the log-delete password (Owner or Admin only)
router.put('/settings/log-delete-password', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Owner' && req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Only Owner or Admin can change this password.' });
  }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Both current and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
  try {
    const [rows] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'log_delete_password'");
    if (rows.length === 0) return res.status(500).json({ message: 'Password not configured' });
    const match = await bcrypt.compare(currentPassword, rows[0].setting_value);
    if (!match) return res.status(403).json({ message: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE app_settings SET setting_value = ? WHERE setting_key = 'log_delete_password'", [newHash]);
    await logActivity(req.user.email, 'Settings Changes', 'Log delete password was changed');
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
