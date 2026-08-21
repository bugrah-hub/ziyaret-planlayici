// Takvim toplantı başlıklarını organizations tablosundaki firma isimleriyle
// eşleştiren fuzzy-matching yardımcı fonksiyonları.
// (Manuel yapılan eşleştirmenin aynı mantığının Node.js karşılığı.)

const STOP_WORDS = new Set(
  "SANAYI VE TICARET LIMITED SIRKETI ANONIM TIC LTD STI A S SAN DIS SATIS PAZARLAMA HIZMETLER"
    .split(" ")
);

const TR_MAP = { İ: "I", I: "I", Ö: "O", Ü: "U", Ç: "C", Ş: "S", Ğ: "G" };

function normalize(s) {
  if (!s) return "";
  let out = s
    .toUpperCase()
    .split("")
    .map((ch) => TR_MAP[ch] || ch)
    .join("");
  out = out.replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return out;
}

function tokens(normStr) {
  return normStr.split(" ").filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

// basit Levenshtein tabanlı benzerlik oranı (0..1), Python difflib.SequenceMatcher
// ile tam aynı olmasa da benzer davranır
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

// Toplantı başlığından "çekirdek" firma adını çıkarır: parantez içi notları
// ve tire/virgül/slash sonrası eklenen notları atar.
function extractCore(title) {
  let core = title.replace(/\([^)]*\)/g, " ");
  core = core.split(/[-,/]/)[0];
  return core.trim();
}

// districts: başlıkta parantez içinde geçen ilçe/semt adayları (opsiyonel, string[])
function extractDistrictHints(title) {
  const hints = [];
  const parens = [...title.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  for (const p of parens) {
    const norm = normalize(p);
    if (norm && norm.split(" ").length <= 3) hints.push(norm);
  }
  return hints;
}

/**
 * @param {string} eventTitle - takvim etkinlik başlığı
 * @param {Array<{key,name,address}>} orgs - organizations tablosu satırları
 * @returns {{core:string, best: object|null, score: number, confidence: string}}
 */
function matchEvent(eventTitle, orgs) {
  const core = extractCore(eventTitle);
  const coreNorm = normalize(core);
  const coreTokens = tokens(coreNorm);
  const districtHints = extractDistrictHints(eventTitle);

  let best = null;
  let bestScore = 0;

  for (const o of orgs) {
    const orgNorm = normalize(o.name);
    const orgTokens = tokens(orgNorm);
    let score = 0;
    for (const t of coreTokens) {
      for (const ot of orgTokens) {
        if (t === ot) score += 3;
        else if (t.length > 3 && (ot.includes(t) || t.includes(ot))) score += 1;
      }
    }
    const sim = similarity(coreNorm, orgNorm);
    let total = score + sim * 2;

    if (districtHints.length && o.address) {
      const addrNorm = normalize(o.address);
      const districtMatch = districtHints.some((d) => addrNorm.includes(d));
      if (districtMatch) total += 2;
    }

    if (total > bestScore) {
      bestScore = total;
      best = o;
    }
  }

  let confidence = "none";
  if (best) {
    if (bestScore >= 6) confidence = "high";
    else if (bestScore >= 3) confidence = "medium";
    else confidence = "low";
  }

  return { core, best, score: Math.round(bestScore * 100) / 100, confidence };
}

module.exports = { matchEvent, normalize, extractCore, extractDistrictHints };
