require("dotenv").config();

const express = require("express");
const pool = require("./db");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/**
 * GET all expenses
 */
app.get("/expenses", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM expenses ORDER BY expense_date DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST a new expense
 */
app.post("/expenses", async (req, res) => {
  const { amount, expense_date, category_id, note } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO expenses (amount, expense_date, category_id, note)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [amount, expense_date, category_id, note]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Insert failed" });
  }
});

/**
 * Monthly summary report
 */
app.get("/reports/monthly", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        date_trunc('month', expense_date) AS month,
        SUM(amount) AS total
      FROM expenses
      GROUP BY month
      ORDER BY month;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Report failed" });
  }
});

app.get("/test", async (req, res) => {
	res.json({
		"data" : "test_data"
	});
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port => ${PORT}`);
});
