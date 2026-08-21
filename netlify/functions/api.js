const express = require("express");
const serverless = require("serverless-http");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const router = express.Router();

// --- Organizations ---
router.get("/organizations", async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    let result;
    if (q) {
      result = await pool.query(
        "SELECT * FROM organizations WHERE name ILIKE $1 ORDER BY name LIMIT 200",
        [`%${q}%`]
      );
    } else {
      result = await pool.query("SELECT * FROM organizations ORDER BY name LIMIT 3000");
    }
    const orgs = result.rows;
    res.json({
      isPlaceholderData: orgs.some((o) => o.placeholder),
      count: orgs.length,
      organizations: orgs,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Salespeople ---
router.get("/salespeople", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM salespeople ORDER BY name");
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/salespeople", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    const result = await pool.query(
      "INSERT INTO salespeople (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name",
      [name.trim()]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: "already exists" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Visits ---
router.get("/visits", async (req, res) => {
  const { date, salesperson } = req.query;
  try {
    let sql = "SELECT * FROM visits WHERE 1=1";
    const params = [];
    if (date) {
      params.push(date);
      sql += ` AND visit_date = $${params.length}`;
    }
    if (salesperson) {
      params.push(salesperson);
      sql += ` AND salesperson = $${params.length}`;
    }
    sql += " ORDER BY visit_date, order_in_day, id";
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/visits", async (req, res) => {
  const { org_key, org_name, salesperson, visit_date, notes } = req.body;
  if (!org_key || !org_name || !salesperson || !visit_date) {
    return res.status(400).json({ error: "org_key, org_name, salesperson, visit_date required" });
  }
  try {
    const maxOrderResult = await pool.query(
      "SELECT COALESCE(MAX(order_in_day), -1) AS m FROM visits WHERE salesperson = $1 AND visit_date = $2",
      [salesperson, visit_date]
    );
    const nextOrder = maxOrderResult.rows[0].m + 1;
    const result = await pool.query(
      `INSERT INTO visits (org_key, org_name, salesperson, visit_date, notes, order_in_day)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [org_key, org_name, salesperson, visit_date, notes || "", nextOrder]
    );
    res.json({ id: result.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/visits/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM visits WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/visits/:id/reorder", async (req, res) => {
  const { order_in_day } = req.body;
  try {
    await pool.query("UPDATE visits SET order_in_day = $1 WHERE id = $2", [order_in_day, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use("/api", router);

module.exports.handler = serverless(app);
