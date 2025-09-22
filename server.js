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
    'http://localhost:8080',
    'https://aquamarine-zabaione-bfd984.netlify.app'
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
// Test database connection + ensure tables
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL database successfully!');

    try {
      // Table 1: catalogservice_supplierinvoice
      await client.query(`
        CREATE TABLE IF NOT EXISTS catalogservice_supplierinvoice (
          id SERIAL PRIMARY KEY,
          supplier_id VARCHAR(50) NOT NULL,
          invoice_number VARCHAR(100) NOT NULL,
          sap_invoice_number VARCHAR(100),
          invoice_date DATE NOT NULL,
          amount NUMERIC(15, 2) NOT NULL,
          currency_code VARCHAR(10) NOT NULL,
          status CHAR(1) NOT NULL CHECK (status IN ('S', 'P', 'E')),
          message TEXT,
          created_by VARCHAR(100) NOT NULL,
          purchase_order VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Table 2: newcatalogservice_supplierinvoice
      await client.query(`
        CREATE TABLE IF NOT EXISTS newcatalogservice_supplierinvoice (
          id SERIAL PRIMARY KEY,
          invoiceNumber VARCHAR(100) NOT NULL,
          supplierNumber VARCHAR(50) NOT NULL,
          orderReference VARCHAR(100),
          itemNumber VARCHAR(50),
          description TEXT,
          quantity NUMERIC(15, 2),
          unitPrice NUMERIC(15, 2),
          currency VARCHAR(10),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      console.log("✅ Tables ensured: catalogservice_supplierinvoice & newcatalogservice_supplierinvoice");
    } catch (tableErr) {
      console.error("❌ Error creating tables:", tableErr.message);
    }

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

     await pool.query(`
      ALTER TABLE catalogservice_supplierinvoice
      ALTER COLUMN purchase_order TYPE VARCHAR(100);
    `);
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
      created_by,
      purchase_order // ✅ new field
    } = req.body;

    // Validate status
    const allowedStatus = ['S', 'P', 'E'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed values are ${allowedStatus.join(', ')}`
      });
    }

    const result = await pool.query(
      `INSERT INTO catalogservice_supplierinvoice 
       (supplier_id, invoice_number, sap_invoice_number, invoice_date, amount, 
        currency_code, status, message, created_by, purchase_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        supplier_id,
        invoice_number,
        sap_invoice_number,
        invoice_date,
        amount,
        currency_code,
        status,
        message,
        created_by,
        purchase_order // ✅ new parameter
      ]
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
app.patch('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { sap_invoice_number, status, message, updated_by } = req.body;

    // Collect fields dynamically
    const updates = [];
    const values = [];
    let index = 1;

    if (sap_invoice_number !== undefined) {
      updates.push(`sap_invoice_number = $${index++}`);
      values.push(sap_invoice_number);
    }
    if (status !== undefined) {
      updates.push(`status = $${index++}`);
      values.push(status);
    }
    if (message !== undefined) {
      updates.push(`message = $${index++}`);
      values.push(message);
    }
    if (updated_by !== undefined) {
      updates.push(`updated_by = $${index++}`);
      values.push(updated_by);
    }

    // If no fields provided, return error
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    const query = `
      UPDATE catalogservice_supplierinvoice
      SET ${updates.join(', ')}
      WHERE invoice_id = $${index}
      RETURNING *;
    `;

    values.push(id);

    const result = await pool.query(query, values);

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

// DELETE all invoices
app.delete('/api/invoices', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM catalogservice_supplierinvoice RETURNING *');

    res.json({
      success: true,
      message: 'All invoices deleted successfully',
      deletedCount: result.rowCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


app.get('/api/new-invoices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM newcatalogservice_supplierinvoice ORDER BY id');
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

// POST - Create new invoice line
app.post('/api/new-invoices', async (req, res) => {
  try {
    const {
      invoiceNumber,
      supplierNumber,
      orderReference,
      itemNumber,
      description,
      quantity,
      unitPrice,
      currency
    } = req.body;

    const result = await pool.query(
      `INSERT INTO newcatalogservice_supplierinvoice
       (invoiceNumber, supplierNumber, orderReference, itemNumber, description, quantity, unitPrice, currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        invoiceNumber,
        supplierNumber,
        orderReference,
        itemNumber,
        description,
        quantity,
        unitPrice,
        currency
      ]
    );

    res.status(201).json({
      success: true,
      message: 'New invoice line created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET single new invoice by ID
app.get('/api/new-invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM newcatalogservice_supplierinvoice WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'New invoice not found'
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