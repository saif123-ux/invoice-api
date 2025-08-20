const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // Added CORS import
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration - ADD THIS SECTION
app.use(cors({
  origin: [
    'https://port4004-workspaces-ws-cvxwr.eu10.applicationstudio.cloud.sap',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Middleware
app.use(express.json());

// Handle preflight requests
app.options('*', cors()); // Enable preflight for all routes

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ZMSmSyrFobRGbLJHcekILDyZyVXMOBAs@shortline.proxy.rlwy.net:46099/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database successfully!');
    release();
  }
});

// Routes

// GET all invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM catalogservice_supplierinvoice ORDER BY invoice_id');
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET invoice by ID
app.get('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM catalogservice_supplierinvoice WHERE invoice_id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// CREATE new invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const {
      supplier_id,
      invoice_number,
      sap_invoice_number,
      invoice_date,
      amount,
      currency_code,
      status,
      message,
      created_by
    } = req.body;

    const result = await pool.query(
      `INSERT INTO catalogservice_supplierinvoice 
       (supplier_id, invoice_number, sap_invoice_number, invoice_date, amount, 
        currency_code, status, message, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [supplier_id, invoice_number, sap_invoice_number, invoice_date, amount, 
       currency_code, status, message, created_by]
    );

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// UPDATE invoice
app.put('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      supplier_id,
      invoice_number,
      sap_invoice_number,
      invoice_date,
      amount,
      currency_code,
      status,
      message,
      updated_by
    } = req.body;

    const result = await pool.query(
      `UPDATE catalogservice_supplierinvoice 
       SET supplier_id = $1, invoice_number = $2, sap_invoice_number = $3, 
           invoice_date = $4, amount = $5, currency_code = $6, status = $7, 
           message = $8, updated_by = $9, updated_at = NOW()
       WHERE invoice_id = $10
       RETURNING *`,
      [supplier_id, invoice_number, sap_invoice_number, invoice_date, amount,
       currency_code, status, message, updated_by, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE invoice
app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM catalogservice_supplierinvoice WHERE invoice_id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      message: 'Invoice deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is running successfully',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('CORS enabled for:');
  console.log('- https://port4004-workspaces-ws-cvxwr.eu10.applicationstudio.cloud.sap');
  console.log('- http://localhost:3000');
  console.log('- http://localhost:5173');
  console.log('- http://localhost:8080');
});