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
    const { name, phone, product } = req.body || {};

    if (!name || !phone || !product) {
      return res.status(400).json({ ok: false, error: "Ism, telefon va mahsulot majburiy" });
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

// Oddiy HTML-escape, xabarga zararli teglar tushmasligi uchun
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}