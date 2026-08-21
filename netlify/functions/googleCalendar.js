// Google Calendar entegrasyonu: tek bir Google hesabı (uygulama sahibi) OAuth
// refresh token ile yetkilendirilir. O hesapla PAYLAŞILAN takvimler (satışçıların
// email adresleri calendarId olarak) bu refresh token üzerinden okunur.
//
// Gerekli environment variable'lar (Netlify Site settings > Environment variables):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REFRESH_TOKEN   (bir kerelik OAuth akışıyla elde edilir, KURULUM.md'ye bakın)

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";

let cachedAccessToken = null;
let cachedExpiry = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < cachedExpiry - 30000) {
    return cachedAccessToken;
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "Google Calendar bağlantısı ayarlanmamış (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN eksik)."
    );
  }
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Google token yenileme hatası: " + text);
  }
  const data = await res.json();
  cachedAccessToken = data.access_token;
  cachedExpiry = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

/**
 * Belirli bir takvimden (calendarId = email) tarih aralığındaki etkinlikleri çeker.
 * @param {string} calendarId
 * @param {string} timeMinISO
 * @param {string} timeMaxISO
 */
async function listEvents(calendarId, timeMinISO, timeMaxISO) {
  const token = await getAccessToken();
  const url = new URL(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set("timeMin", timeMinISO);
  url.searchParams.set("timeMax", timeMaxISO);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Takvim okunamadı (${calendarId}): ${text}`);
  }
  const data = await res.json();
  return (data.items || []).map((ev) => ({
    id: ev.id,
    title: ev.summary || "(başlıksız)",
    start: ev.start?.dateTime || ev.start?.date,
    isAllDay: !ev.start?.dateTime,
  }));
}

module.exports = { listEvents };
