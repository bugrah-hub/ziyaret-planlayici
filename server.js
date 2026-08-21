const express = require("express");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new Database(path.join(__dirname, "data.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_key TEXT NOT NULL,
    org_name TEXT NOT NULL,
    salesperson TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    notes TEXT DEFAULT '',
    order_in_day INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS salespeople (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
`);

// Seed a few default salespeople if table is empty
const spCount = db.prepare("SELECT COUNT(*) c FROM salespeople").get().c;
if (spCount === 0) {
  const insert = db.prepare("INSERT INTO salespeople (name) VALUES (?)");
  ["Ahmet Yılmaz", "Elif Kaya", "Mehmet Demir", "Zeynep Şahin"].forEach((n) =>
    insert.run(n)
  );
}

// Load organizations (locations.json produced by geocode.py, or placeholder)
const LOCATIONS_PATH = path.join(__dirname, "locations.json");
function loadLocations() {
  if (!fs.existsSync(LOCATIONS_PATH)) return [];
  return JSON.parse(fs.readFileSync(LOCATIONS_PATH, "utf-8"));
}

// --- API: Organizations ---
app.get("/api/organizations", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  let orgs = loadLocations();
  if (q) {
    orgs = orgs.filter((o) => o.name.toLowerCase().includes(q));
  }
  res.json({
    isPlaceholderData: orgs.some((o) => o.placeholder),
    count: orgs.length,
    organizations: orgs,
  });
});

// --- API: Salespeople ---
app.get("/api/salespeople", (req, res) => {
  const rows = db.prepare("SELECT * FROM salespeople ORDER BY name").all();
  res.json(rows);
});

app.post("/api/salespeople", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    const info = db.prepare("INSERT INTO salespeople (name) VALUES (?)").run(name.trim());
    res.json({ id: info.lastInsertRowid, name: name.trim() });
  } catch (e) {
    res.status(400).json({ error: "already exists" });
  }
});

// --- API: Visits (assignments) ---
app.get("/api/visits", (req, res) => {
  const { date, salesperson } = req.query;
  let sql = "SELECT * FROM visits WHERE 1=1";
  const params = [];
  if (date) {
    sql += " AND visit_date = ?";
    params.push(date);
  }
  if (salesperson) {
    sql += " AND salesperson = ?";
    params.push(salesperson);
  }
  sql += " ORDER BY visit_date, order_in_day, id";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post("/api/visits", (req, res) => {
  const { org_key, org_name, salesperson, visit_date, notes } = req.body;
  if (!org_key || !org_name || !salesperson || !visit_date) {
    return res.status(400).json({ error: "org_key, org_name, salesperson, visit_date required" });
  }
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(order_in_day), -1) m FROM visits WHERE salesperson = ? AND visit_date = ?")
    .get(salesperson, visit_date).m;
  const info = db
    .prepare(
      "INSERT INTO visits (org_key, org_name, salesperson, visit_date, notes, order_in_day) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(org_key, org_name, salesperson, visit_date, notes || "", maxOrder + 1);
  res.json({ id: info.lastInsertRowid });
});

app.delete("/api/visits/:id", (req, res) => {
  db.prepare("DELETE FROM visits WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.put("/api/visits/:id/reorder", (req, res) => {
  const { order_in_day } = req.body;
  db.prepare("UPDATE visits SET order_in_day = ? WHERE id = ?").run(order_in_day, req.params.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => console.log(`Sales route planner running on http://localhost:${PORT}`));
