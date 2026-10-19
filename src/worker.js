
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("Mutualalove Worker aktif!", {
        status: 200,
      });
    }

    if (url.pathname === "/webhook") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
        });
      }

      // Handler webhook Telegram akan ditambahkan
      // setelah konfigurasi token dan bot disiapkan.
      return new Response("Webhook endpoint siap", {
        status: 200,
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

