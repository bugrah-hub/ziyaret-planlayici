const express = require("express");
const serverless = require("serverless-http");
const { Pool } = require("pg");
const { matchEvent } = require("./matcher");
const { listEvents } = require("./googleCalendar");

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
  const { name, calendar_email } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  try {
    const result = await pool.query(
      "INSERT INTO salespeople (name, calendar_email) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING id, name, calendar_email",
      [name.trim(), calendar_email ? calendar_email.trim() : null]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: "already exists" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Satışçının Google Calendar email'ini ayarla/güncelle
router.put("/salespeople/:id/calendar-email", async (req, res) => {
  const { calendar_email } = req.body;
  try {
    const result = await pool.query(
      "UPDATE salespeople SET calendar_email = $1 WHERE id = $2 RETURNING id, name, calendar_email",
      [calendar_email ? calendar_email.trim() : null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// --- Calendar sync ---
// Belirli bir tarih için aktif satışçıların (calendar_email'i olan) Google
// Calendar'larından o günkü etkinlikleri çeker, organizations ile eşleştirir.
// Yüksek/orta güvenli eşleşmeleri doğrudan visits'e ekler; düşük güvenli veya
// eşleşmeyenleri pending_matches tablosuna yazar (kullanıcı onayı bekler).
router.post("/calendar-sync", async (req, res) => {
  const { visit_date, salespeople: targetNames } = req.body;
  if (!visit_date) return res.status(400).json({ error: "visit_date required" });

  try {
    let spResult;
    if (targetNames && targetNames.length) {
      spResult = await pool.query(
        "SELECT * FROM salespeople WHERE name = ANY($1) AND calendar_email IS NOT NULL",
        [targetNames]
      );
    } else {
      spResult = await pool.query(
        "SELECT * FROM salespeople WHERE calendar_email IS NOT NULL"
      );
    }
    const salespeople = spResult.rows;
    if (salespeople.length === 0) {
      return res.json({
        added: [],
        pending: [],
        warning:
          "Hiçbir satışçının calendar_email'i ayarlı değil. Ayarlar panelinden ekleyin.",
      });
    }

    const orgsResult = await pool.query("SELECT key, name, address FROM organizations");
    const orgs = orgsResult.rows;

    const dayStart = `${visit_date}T00:00:00+03:00`;
    const dayEnd = `${visit_date}T23:59:59+03:00`;

    const added = [];
    const pending = [];
    const errors = [];

    for (const sp of salespeople) {
      let events;
      try {
        events = await listEvents(sp.calendar_email, dayStart, dayEnd);
      } catch (e) {
        errors.push({ salesperson: sp.name, error: e.message });
        continue;
      }

      // İç ekip toplantılarını (daily, showcase vb.) filtrelemek için basit bir
      // kara liste — büyük ölçüde tekrarlayan, firma adı içermeyen başlıklar.
      const SKIP_PATTERNS = /daily|showcase|alignment|planlama|worqtad|standup|retro/i;

      for (const ev of events) {
        if (SKIP_PATTERNS.test(ev.title)) continue;

        const { core, best, score, confidence } = matchEvent(ev.title, orgs);

        if (confidence === "high" || confidence === "medium") {
          // zaten eklenmiş mi kontrol et (aynı gün, aynı satışçı, aynı org)
          const existing = await pool.query(
            "SELECT id FROM visits WHERE salesperson=$1 AND visit_date=$2 AND org_key=$3",
            [sp.name, visit_date, best.key]
          );
          if (existing.rows.length > 0) continue;

          const maxOrderResult = await pool.query(
            "SELECT COALESCE(MAX(order_in_day), -1) AS m FROM visits WHERE salesperson = $1 AND visit_date = $2",
            [sp.name, visit_date]
          );
          const nextOrder = maxOrderResult.rows[0].m + 1;
          const insertResult = await pool.query(
            `INSERT INTO visits (org_key, org_name, salesperson, visit_date, notes, order_in_day, source)
             VALUES ($1, $2, $3, $4, $5, $6, 'calendar') RETURNING id`,
            [best.key, best.name, sp.name, visit_date, `Takvim: ${ev.title}`, nextOrder]
          );
          added.push({
            visit_id: insertResult.rows[0].id,
            salesperson: sp.name,
            event_title: ev.title,
            matched_org: best.name,
            confidence,
          });
        } else {
          const insertResult = await pool.query(
            `INSERT INTO pending_matches
               (salesperson, calendar_email, event_title, event_start, visit_date, suggested_org_key, suggested_org_name, confidence, score)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [
              sp.name,
              sp.calendar_email,
              ev.title,
              ev.start,
              visit_date,
              best ? best.key : null,
              best ? best.name : null,
              confidence,
              score,
            ]
          );
          pending.push({
            id: insertResult.rows[0].id,
            salesperson: sp.name,
            event_title: ev.title,
            suggested_org: best ? best.name : null,
            confidence,
          });
        }
      }
    }

    res.json({ added, pending, errors });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Onay bekleyen eşleşmeleri listele
router.get("/pending-matches", async (req, res) => {
  const { visit_date } = req.query;
  try {
    let sql = "SELECT * FROM pending_matches WHERE status = 'pending'";
    const params = [];
    if (visit_date) {
      params.push(visit_date);
      sql += ` AND visit_date = $${params.length}`;
    }
    sql += " ORDER BY visit_date, salesperson";
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bekleyen eşleşmeyi onayla: seçilen org_key ile visits'e ekle
router.post("/pending-matches/:id/confirm", async (req, res) => {
  const { org_key, org_name } = req.body;
  if (!org_key || !org_name) return res.status(400).json({ error: "org_key, org_name required" });
  try {
    const pmResult = await pool.query("SELECT * FROM pending_matches WHERE id = $1", [req.params.id]);
    if (pmResult.rows.length === 0) return res.status(404).json({ error: "not found" });
    const pm = pmResult.rows[0];

    const maxOrderResult = await pool.query(
      "SELECT COALESCE(MAX(order_in_day), -1) AS m FROM visits WHERE salesperson = $1 AND visit_date = $2",
      [pm.salesperson, pm.visit_date]
    );
    const nextOrder = maxOrderResult.rows[0].m + 1;
    const insertResult = await pool.query(
      `INSERT INTO visits (org_key, org_name, salesperson, visit_date, notes, order_in_day, source)
       VALUES ($1,$2,$3,$4,$5,$6,'calendar') RETURNING id`,
      [org_key, org_name, pm.salesperson, pm.visit_date, `Takvim: ${pm.event_title}`, nextOrder]
    );
    await pool.query("UPDATE pending_matches SET status = 'confirmed' WHERE id = $1", [req.params.id]);
    res.json({ visit_id: insertResult.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Bekleyen eşleşmeyi reddet/yoksay
router.post("/pending-matches/:id/dismiss", async (req, res) => {
  try {
    await pool.query("UPDATE pending_matches SET status = 'dismissed' WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use("/api", router);

module.exports.handler = serverless(app);
