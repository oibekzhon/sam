async function checkRateLimit(ip) {
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.error("Upstash sozlanmagan, rate limiting o'tkazib yuborildi!");
    return true;
  }

  const key = `ratelimit:${ip}`;
  const MAX_REQUESTS = 5;
  const WINDOW_SECONDS = 60;

  try {
    const incrResponse = await fetch(`${UPSTASH_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const incrData = await incrResponse.json();
    const count = incrData.result;

    if (count === 1) {
      await fetch(`${UPSTASH_URL}/expire/${key}/${WINDOW_SECONDS}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
    }

    return count <= MAX_REQUESTS;
  } catch (err) {
    console.error("Rate limit tekshiruvida xatolik:", err);
    return true;
  }
}

export default async function handler(req, res) {
  const ALLOWED_ORIGINS = ["https://samarkandbreads.yolaco.uz", "https://oibekzhon.github.io"];
  const origin = req.headers.origin;
  const ALLOWED_ORIGIN = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Faqat POST so'rovlarga ruxsat berilgan" });
  }

  try {
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return res.status(429).json({ ok: false, error: "Juda ko'p so'rov yubordingiz, biroz kuting" });
    }

    const { name, phone, product, website, turnstileToken } = req.body || {};

    if (website) {
      return res.status(400).json({ ok: false, error: "So'rov rad etildi" });
    }

    if (!name || !phone || !product) {
      return res.status(400).json({ ok: false, error: "Ism, telefon va mahsulot majburiy" });
    }

    if (!turnstileToken) {
      return res.status(400).json({ ok: false, error: "Captcha tasdiqlanmadi" });
    }

    const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
    if (!TURNSTILE_SECRET_KEY) {
      console.error("TURNSTILE_SECRET_KEY sozlanmagan!");
      return res.status(500).json({ ok: false, error: "Server sozlamalarida xatolik" });
    }

    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: TURNSTILE_SECRET_KEY,
          response: turnstileToken
        })
      }
    );

    const verifyData = await verifyResponse.json();

    if (!verifyData.success) {
      console.error("Turnstile tasdiqlanmadi:", verifyData["error-codes"]);
      return res.status(400).json({ ok: false, error: "Captcha tasdiqlanmadi, qaytadan urinib ko'ring" });
    }

    if (String(name).length > 60 || String(phone).length > 30) {
      return res.status(400).json({ ok: false, error: "Kiritilgan ma'lumot juda uzun" });
    }

    const namePattern = /^[a-zA-ZʻʼʹА-Яа-яЁёʼ'\-\s]{2,60}$/u;
    if (!namePattern.test(name)) {
      return res.status(400).json({ ok: false, error: "Ism formati noto'g'ri" });
    }

    const phonePattern = /^[\d\s()+\-]{7,20}$/;
    if (!phonePattern.test(phone)) {
      return res.status(400).json({ ok: false, error: "Telefon raqami formati noto'g'ri" });
    }

    const ALLOWED_PRODUCTS = [
      "Gala-Osiyo noni",
      "Kunjutli obinon",
      "Sariyog'li patir"
    ];
    if (!ALLOWED_PRODUCTS.includes(product)) {
      return res.status(400).json({ ok: false, error: "Noma'lum mahsulot" });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error("Environment variables sozlanmagan!");
      return res.status(500).json({ ok: false, error: "Server sozlamalarida xatolik" });
    }

    const messageText =
      `🔔 <b>YANGI BUYURTMA!</b>\n\n` +
      `👤 <b>Mijoz:</b> ${escapeHtml(name)}\n` +
      `📞 <b>Telefon:</b> ${escapeHtml(phone)}\n` +
      `🍞 <b>Mahsulot:</b> ${escapeHtml(product)}\n` +
      `📅 <b>Vaqt:</b> ${new Date().toLocaleString("uz-UZ")}`;

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: messageText,
          parse_mode: "HTML"
        })
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramData.ok) {
      console.error("Telegram xatolik:", telegramData.description);
      return res.status(502).json({ ok: false, error: "Telegramga yuborishda xatolik" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Server xatolik:", err);
    return res.status(500).json({ ok: false, error: "Ichki server xatoligi" });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}