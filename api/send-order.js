export default async function handler(req, res) {
  const ALLOWED_ORIGIN = "https://oibekzhon.github.io";
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
    const { name, phone, product, website, turnstileToken } = req.body || {};

    // Honeypot: haqiqiy foydalanuvchi bu maydonni ko'rmaydi va to'ldirmaydi.
    if (website) {
      return res.status(400).json({ ok: false, error: "So'rov rad etildi" });
    }

    if (!name || !phone || !product) {
      return res.status(400).json({ ok: false, error: "Ism, telefon va mahsulot majburiy" });
    }

    // ---- Cloudflare Turnstile tekshiruvi ----
    if (!turnstileToken) {
      return res.status(400).json({ ok: false, error: "Captcha tasdiqlanmadi" });
    }

    // VAQTINCHA DIAGNOSTIKA
    console.log("DEBUG: token uzunligi:", turnstileToken.length, "| boshi:", JSON.stringify(turnstileToken.slice(0, 10)));

    const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
    if (!TURNSTILE_SECRET_KEY) {
      console.error("TURNSTILE_SECRET_KEY sozlanmagan!");
      return res.status(500).json({ ok: false, error: "Server sozlamalarida xatolik" });
    }
    // VAQTINCHA DIAGNOSTIKA - to'liq kalitni ko'rsatish (faqat siz ko'rasiz, Vercel Logs'da)
    console.log("DEBUG: TO'LIQ KALIT:", JSON.stringify(TURNSTILE_SECRET_KEY));

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
    // ---- Turnstile tekshiruvi tugadi ----

    // Uzunlik chegaralari
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