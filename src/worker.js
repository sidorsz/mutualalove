
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Tes apakah Worker aktif
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Mutualalove Worker aktif!");
    }

    // Endpoint webhook Telegram
    if (url.pathname !== "/webhook") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
      });
    }

    // Periksa rahasia webhook
    const secret =
      request.headers.get("X-Telegram-Bot-Api-Secret-Token");

    if (
      !env.TELEGRAM_WEBHOOK_SECRET ||
      secret !== env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return new Response("Unauthorized", {
        status: 401,
      });
    }

    if (!env.USER_BOT_TOKEN) {
      return new Response("Bot token belum dikonfigurasi", {
        status: 500,
      });
    }

    try {
      const update = await request.json();
      const message = update.message;

      if (!message?.chat?.id || !message.text) {
        return new Response("OK");
      }

      const chatId = message.chat.id;
      const text = message.text.trim();

      let reply;

      if (text === "/start" || text.startsWith("/start ")) {
        reply =
          "Halo! 👋 Selamat datang di Mutualalove.\n\n" +
          "Bot berhasil terhubung. Fitur lainnya sedang disiapkan.";
      } else {
        // Abaikan pesan selain /start untuk pengujian awal
        return new Response("OK");
      }

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${env.USER_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: reply,
          }),
        }
      );

      if (!telegramResponse.ok) {
        console.error(
          "Telegram sendMessage gagal:",
          telegramResponse.status
        );
        return new Response("Gagal mengirim pesan", {
          status: 502,
        });
      }

      return new Response("OK");
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Internal Server Error", {
        status: 500,
      });
    }
  },
};
