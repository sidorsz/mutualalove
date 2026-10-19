require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const games = require('./games');

const USER_BOT_TOKEN = process.env.USER_BOT_TOKEN || '8620382532:AAHUumW7W-Hqmxlk7sNd442B5bs-8tKpFgo';
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || '8223841670:AAHzzHyyiZWotUE0z87lFw2WYMkpUQ4Faqk';

const userBot = new Telegraf(USER_BOT_TOKEN);
const adminBot = new Telegraf(ADMIN_BOT_TOKEN);

// State sementara di memori (untuk input teks bertahap & edit profil)
const userState = new Map(); // userId -> { action, targetId, ... }
const adminState = new Map(); // adminId -> { action, targetId }

const photoList = (u) => (u && u.photos ? u.photos.split(',').filter(Boolean) : []);

// Persistent Menu Utama Keyboard untuk User Bot
const mainMenuKeyboard = Markup.keyboard([
  ['❤️ Cari Pasangan', '📍 Cari di Sekitar'],
  ['💌 Riwayat Suka & Match', '🎮 Main Game'],
  ['👤 Profil Saya', '⚙️ Bantuan & Pengaturan'],
]).resize();

// Keyboard pemilihan lokasi cepat
const locationKeyboard = Markup.keyboard([
  [Markup.button.locationRequest('📍 Kirim Lokasi GPS Saya')],
  ['🗺️ Pilih Provinsi / Kota', '🏙️ Jakarta', '🏙️ Bandung'],
  ['🏙️ Surabaya', '🏙️ Medan', '🏙️ Makassar'],
]).resize();

// Daftar Tombol Wilayah/Provinsi Lengkap Indonesia
const PROVINCE_BUTTONS = [
  [
    Markup.button.callback('🏛️ DKI Jakarta', 'set_loc:jakarta'),
    Markup.button.callback('🏔️ Jawa Barat (Bandung/dll)', 'set_loc:bandung'),
  ],
  [
    Markup.button.callback('🌾 Jawa Tengah (Semarang/Solo)', 'set_loc:semarang'),
    Markup.button.callback('🎓 DI Yogyakarta', 'set_loc:yogyakarta'),
  ],
  [
    Markup.button.callback('🌊 Jawa Timur (Surabaya/Malang)', 'set_loc:surabaya'),
    Markup.button.callback('🏭 Banten (Tangerang/Serang)', 'set_loc:tangerang'),
  ],
  [
    Markup.button.callback('🌴 Sumatera Utara (Medan/Nias)', 'set_loc:medan'),
    Markup.button.callback('🌿 Sumatera Barat (Padang)', 'set_loc:padang'),
  ],
  [
    Markup.button.callback('🏖️ Bali & Nusa Tenggara', 'set_loc:bali'),
    Markup.button.callback('🛢️ Riau & Kepulauan Riau', 'set_loc:pekanbaru'),
  ],
  [
    Markup.button.callback('🚢 Sumsel & Lampung', 'set_loc:palembang'),
    Markup.button.callback('🌲 Kalimantan', 'set_loc:balikpapan'),
  ],
  [
    Markup.button.callback('⛰️ Sulawesi (Makassar/Manado)', 'set_loc:makassar'),
    Markup.button.callback('🌺 Maluku & Papua', 'set_loc:jayapura'),
  ],
  [Markup.button.callback('✏️ Ketik Nama Kota / Daerah Manual', 'prompt_type_city')],
];

// -------------------------------------------------------------
// 1. BOT PERTAMA (User Bot: @mutuallovelyBot)
// -------------------------------------------------------------

// /start: Registrasi baru atau Dashboard akun
userBot.start(async (ctx) => {
  const uid = ctx.from.id;
  const username = ctx.from.username || '';
  const u = db.getUser(uid);

  // Jika user sudah menyelesaikan profil sebelumnya
  if (u && u.step === 'done') {
    const verifiedBadge =
      u.status === 'verified'
        ? '✅ Terverifikasi Asli (Centang Biru)'
        : u.status === 'pending'
          ? '⏳ Menunggu Verifikasi Admin'
          : '❌ Ditolak';
    const photos = photoList(u);
    const hasVoice = u.voice ? '✅ Ada' : '⚠️ Belum Ada';

    const greeting =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👋 <b>SELAMAT DATANG KEMBALI!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Halo <b>${u.name}</b>, akunmu siap digunakan:\n\n` +
      `• <b>Status:</b> ${verifiedBadge}\n` +
      `• <b>Usia:</b> ${u.age} tahun\n` +
      `• <b>Gender:</b> ${u.gender === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'}\n` +
      `• <b>Mencari:</b> ${u.looking_for === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'}\n` +
      `• <b>Lokasi:</b> ${u.city || 'Indonesia'}` +
      (u.province ? ` (${u.province})` : '') +
      `\n` +
      `• <b>Foto:</b> ${photos.length} foto tersimpan\n` +
      `• <b>Suara:</b> ${hasVoice}\n\n` +
      (u.bio ? `📝 <i>"${u.bio}"</i>\n\n` : '') +
      `Silakan gunakan menu di bawah untuk mencari pasangan:`;

    return ctx.replyWithHTML(greeting, mainMenuKeyboard);
  }

  // Mulai pendaftaran baru
  db.upsert(uid, {
    username,
    step: 'name',
    status: 'incomplete',
    photos: '',
    voice: '',
  });

  const welcomeText =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `❤️ <b>MUTUAL LOVELY DATING BOT</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Halo <b>${ctx.from.first_name || 'Teman'}</b>! Selamat datang!\n` +
    `Cari teman & pasangan yang cocok di sekitarmu berdasarkan gender, usia, dan lokasi terdekat.\n\n` +
    `🛡️ <b>Ketentuan Bot:</b>\n` +
    `• Hanya mempertemukan <b>Laki-laki & Perempuan</b>.\n` +
    `• Semua profil diverifikasi oleh Admin dengan <b>minimal 2 foto asli</b> dan <b>rekaman suara</b> untuk menjamin keaslian akun.\n` +
    `• Begitu pendaftaran selesai, kamu <b>bisa langsung mencari pasangan</b>!\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👉 <b>Langkah 1:</b> Siapa nama panggilanmu?`;

  await ctx.replyWithHTML(welcomeText, Markup.removeKeyboard());
});

// Tombol Keyboard Utama & Perintah
userBot.hears('❤️ Cari Pasangan', (ctx) => showCandidate(ctx, ctx.from.id, false));
userBot.command(['cari', 'search'], (ctx) => showCandidate(ctx, ctx.from.id, false));

userBot.hears('📍 Cari di Sekitar', (ctx) => showNearbyCandidate(ctx));
userBot.command(['sekitar', 'nearby'], (ctx) => showNearbyCandidate(ctx));

userBot.hears('💌 Riwayat Suka & Match', (ctx) => showHistoryMenu(ctx));
userBot.command(['riwayat', 'matches', 'likes'], (ctx) => showHistoryMenu(ctx));

userBot.hears('👤 Profil Saya', (ctx) => showMyProfile(ctx));
userBot.command(['profil', 'profile', 'me'], (ctx) => showMyProfile(ctx));

userBot.hears('🎮 Main Game', (ctx) => showGameMenu(ctx));

userBot.hears('⚙️ Bantuan & Pengaturan', (ctx) => showHelpMenu(ctx));
userBot.command(['help', 'menu', 'bantuan'], (ctx) => showHelpMenu(ctx));

userBot.command(['edit', 'ubah'], (ctx) => showEditMenu(ctx));

userBot.command(['reset', 'ulang'], async (ctx) => {
  db.upsert(ctx.from.id, { step: 'name', status: 'incomplete', photos: '', voice: '' });
  await ctx.reply('Profil di-reset. Siapa nama panggilanmu?', Markup.removeKeyboard());
});

// Pemilihan Wilayah dari tombol teks keyboard
userBot.hears('🗺️ Pilih Provinsi / Kota', async (ctx) => {
  await ctx.replyWithHTML(
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🗺️ <b>PILIH WILAYAH / PROVINSI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Klik salah satu wilayah di bawah, atau langsung ketik nama kotamu:`,
    Markup.inlineKeyboard(PROVINCE_BUTTONS)
  );
});

// =============================================================
// HANDLER LOKASI (GPS / VENUE / ATTACHMENT)
// Mengatasi masalah tombol GPS tidak merespon di mobile/desktop
// =============================================================
userBot.on(['location', 'venue'], async (ctx) => {
  const uid = ctx.from.id;
  const loc = ctx.message.location || (ctx.message.venue && ctx.message.venue.location);
  if (!loc) return;

  const lat = loc.latitude;
  const lon = loc.longitude;

  // Deteksi kota & provinsi terdekat secara otomatis berdasarkan koordinat GPS
  const nearest = db.findNearestLocation(lat, lon);
  const cityName = nearest ? nearest.name : 'Lokasi GPS';
  const provName = nearest ? nearest.province : '';

  // Simpan koordinat dan hasil deteksi ke database
  db.upsert(uid, {
    lat,
    lon,
    city: cityName,
    province: provName,
  });

  const state = userState.get(uid);
  const u = db.getUser(uid);

  // Jika sedang edit lokasi
  if (state && state.action === 'edit_location') {
    userState.delete(uid);
    const textMsg =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 <b>LOKASI BERHASIL DIPERBARUI</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `• <b>Wilayah Terdeteksi:</b> ${cityName}\n` +
      (provName ? `• <b>Provinsi:</b> ${provName}\n` : '') +
      `• <b>Koordinat GPS:</b> ${lat.toFixed(4)}, ${lon.toFixed(4)}\n\n` +
      `Data lokasimu telah disimpan dan diperbarui!`;

    await ctx.replyWithHTML(textMsg, mainMenuKeyboard);
    return showMyProfile(ctx);
  }

  // Jika sedang dalam alur pendaftaran step 'location'
  if (u && u.step === 'location') {
    db.upsert(uid, { step: 'bio' });

    const textMsg =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 <b>LOKASI BERHASIL DISIMPAN</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `• <b>Wilayah Terdeteksi:</b> ${cityName}\n` +
      (provName ? `• <b>Provinsi:</b> ${provName}\n` : '') +
      `• <b>Koordinat GPS:</b> ${lat.toFixed(4)}, ${lon.toFixed(4)}\n\n` +
      `👉 <b>Langkah Selanjutnya:</b> Tulis deskripsi singkat / bio tentang dirimu (hobi, musik, atau tipe pasangan):\n\n` +
      `<i>Contoh: 'Suka ngopi santai, dengerin indie pop, cari temen ngobrol asik.'</i>`;

    return ctx.replyWithHTML(textMsg, Markup.keyboard([['Lewati Bio ⏩']]).oneTime().resize());
  }

  // Jika user mengirimkan lokasi saat akun sudah selesai (update lokasi langsung)
  const defaultMsg =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 <b>LOKASI TERDETEKSI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `• <b>Wilayah:</b> ${cityName}\n` +
    (provName ? `• <b>Provinsi:</b> ${provName}\n` : '') +
    `• <b>Koordinat:</b> ${lat.toFixed(4)}, ${lon.toFixed(4)}\n\n` +
    `Lokasi akunmu telah berhasil diperbarui!`;

  return ctx.replyWithHTML(defaultMsg, mainMenuKeyboard);
});

// Handler Foto User (Minimal 2 foto asli)
userBot.on('photo', async (ctx) => {
  const uid = ctx.from.id;
  const u = db.getUser(uid);
  if (!u) return ctx.reply('Ketik /start untuk mulai.');

  const state = userState.get(uid);

  // Jika sedang dalam mode edit foto
  if (state && state.action === 'edit_photos') {
    state.newPhotos = state.newPhotos || [];
    const fileId = ctx.message.photo.at(-1).file_id;
    state.newPhotos.push(fileId);

    const count = state.newPhotos.length;
    if (count < 2) {
      return ctx.replyWithHTML(
        `📸 Foto ke-${count} diterima!\nKirim minimal <b>1 foto lagi</b> (syarat minimal 2 foto asli wajah kamu).`
      );
    } else {
      db.upsert(uid, { photos: state.newPhotos.join(',') });
      userState.delete(uid);
      await ctx.replyWithHTML(`✅ <b>${count} Foto profil baru berhasil disimpan!</b>`, mainMenuKeyboard);
      return showMyProfile(ctx);
    }
  }

  // Jika sedang dalam alur pendaftaran step 'photos'
  if (u.step === 'photos') {
    const photos = photoList(u);
    if (photos.length >= 5) {
      return ctx.reply(
        '⚠️ Sudah mencapai batas maksimal 5 foto. Sekarang rekam dan kirim pesan suara singkat (Voice Note) untuk verifikasi admin.'
      );
    }

    const fileId = ctx.message.photo.at(-1).file_id;
    photos.push(fileId);
    db.upsert(uid, { photos: photos.join(',') });

    const count = photos.length;
    if (count === 1) {
      await ctx.replyWithHTML(
        `📸 <b>Foto ke-1 diterima!</b>\n\n` +
        `Silakan kirim minimal <b>1 foto lagi</b> (persyaratan wajib adalah minimal 2 foto asli wajah kamu).`
      );
    } else if (count >= 2) {
      // Pindah ke step verifikasi suara (Voice Note)
      db.upsert(uid, { step: 'voice' });
      await ctx.replyWithHTML(
        `📸 <b>Foto ke-${count} diterima!</b> 👍\n` +
        `Syarat minimal 2 foto asli sudah terpenuhi.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎙️ <b>LANGKAH TERAKHIR: VERIFIKASI SUARA</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Untuk memastikan kamu benar-benar laki-laki atau perempuan asli, rekam dan kirim <b>Pesan Suara (Voice Note)</b> singkat (3 - 10 detik).\n\n` +
        `🗣️ <b>Contoh kalimat yang diucapkan:</b>\n` +
        `<i>"Halo, nama saya ${u.name}, ini suara dan akun asli saya di Mutual Lovely."</i>\n\n` +
        `👉 <b>Cara merekam:</b>\n` +
        `• <b>HP:</b> Tahan ikon Mikrofon di pojok kanan bawah, bicaralah, lalu lepaskan untuk mengirim.\n` +
        `• <b>Desktop:</b> Klik ikon mikrofon untuk merekam lalu kirim.\n\n` +
        `Rekam dan kirim suara aslimu sekarang! 👇`
      );
    }
  }
});

// Handler Voice Note (Pesan Suara untuk Verifikasi Admin)
userBot.on('voice', async (ctx) => {
  const uid = ctx.from.id;
  const u = db.getUser(uid);
  if (!u) return ctx.reply('Ketik /start untuk mulai.');

  const state = userState.get(uid);
  const voiceId = ctx.message.voice.file_id;

  // Jika sedang dalam mode edit suara
  if (state && state.action === 'edit_voice') {
    userState.delete(uid);
    db.upsert(uid, { voice: voiceId });
    await ctx.replyWithHTML('✅ <b>Rekaman suara baru berhasil disimpan dan diperbarui!</b>', mainMenuKeyboard);
    return showMyProfile(ctx);
  }

  // Jika dalam pendaftaran step 'voice'
  if (u.step === 'voice' || u.step === 'photos') {
    const photos = photoList(u);
    if (photos.length < 2) {
      return ctx.reply('⚠️ Harap kirim minimal 2 foto asli terlebih dahulu sebelum merekam suara.');
    }

    db.upsert(uid, { voice: voiceId, step: 'done', status: 'pending' });
    const updatedUser = db.getUser(uid);

    // Kirim data, foto, dan voice note ke Bot Admin (Bot 2)
    try {
      await sendToAdmin(updatedUser, photos, voiceId);
    } catch (err) {
      console.error('Gagal mengirim data verifikasi ke Bot Admin:', err.message);
    }

    const successMsg =
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎉 <b>PENDAFTARAN SELESAI!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Selamat <b>${updatedUser.name}</b>, profilmu berhasil dibuat!\n\n` +
      `• Data, foto, dan rekaman suaramu telah dikirimkan ke <b>Bot Admin</b> untuk verifikasi.\n` +
      `• Sambil menunggu verifikasi, kamu <b>SUDAH BISA LANGSUNG mencari pasangan</b> sekarang!\n\n` +
      `Gunakan menu di bawah untuk mulai menjelajah:`;

    return ctx.replyWithHTML(successMsg, mainMenuKeyboard);
  }
});

// Handler Teks
userBot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  const text = ctx.message.text.trim();
  const u = db.getUser(uid);

  // 1. Cek state: Mengirim pesan like ke seseorang
  const pendingState = userState.get(uid);
  if (pendingState && pendingState.action === 'await_like_message') {
    userState.delete(uid);
    const targetId = pendingState.targetId;
    const target = db.getUser(targetId);

    if (text === '❌ Batal' || text.toLowerCase() === '/batal') {
      await ctx.reply('Pengiriman pesan dibatalkan.', mainMenuKeyboard);
      return showCandidate(ctx, uid, false);
    }

    const { isMatch, partnerMessage } = db.addLike(uid, targetId, text);
    await ctx.reply(`💌 Pesan dan Like berhasil dikirim ke <b>${target ? target.name : 'dia'}</b>!`, {
      parse_mode: 'HTML',
      ...mainMenuKeyboard,
    });

    if (isMatch) {
      await sendMatchNotification(uid, targetId, text, partnerMessage);
    } else {
      userBot.telegram
        .sendMessage(
          targetId,
          `💌 <b>Seseorang menyukai profilmu dan meninggalkan pesan!</b>\n` +
          `Buka bot dan ketik /cari untuk melihat profil & pesannya 😉`,
          { parse_mode: 'HTML' }
        )
        .catch(() => { });
    }

    return showCandidate(ctx, uid, false);
  }

  // 2. Cek state: Edit nama
  if (pendingState && pendingState.action === 'edit_name') {
    userState.delete(uid);
    if (text.length < 2 || text.length > 50) {
      return ctx.reply('Nama terlalu pendek atau terlalu panjang. Coba lagi:');
    }
    db.upsert(uid, { name: text });
    await ctx.replyWithHTML(`✅ Nama berhasil diubah menjadi: <b>${text}</b>`, mainMenuKeyboard);
    return showMyProfile(ctx);
  }

  // 3. Cek state: Edit umur
  if (pendingState && pendingState.action === 'edit_age') {
    userState.delete(uid);
    const age = parseInt(text, 10);
    if (isNaN(age) || age < 18 || age > 80) {
      return ctx.reply('⚠️ Umur tidak valid (harus 18-80 tahun). Edit dibatalkan.', mainMenuKeyboard);
    }
    db.upsert(uid, { age });
    await ctx.replyWithHTML(`✅ Umur berhasil diubah menjadi: <b>${age} tahun</b>`, mainMenuKeyboard);
    return showMyProfile(ctx);
  }

  // 4. Cek state: Edit bio
  if (pendingState && pendingState.action === 'edit_bio') {
    userState.delete(uid);
    const newBio = text === '/hapusbio' ? '' : text.slice(0, 300);
    db.upsert(uid, { bio: newBio });
    await ctx.replyWithHTML(`✅ Bio berhasil diperbarui!`, mainMenuKeyboard);
    return showMyProfile(ctx);
  }

  // 5. Cek state: Edit lokasi via teks
  if (pendingState && pendingState.action === 'edit_location') {
    userState.delete(uid);
    const resolved = db.resolveLocation(text);
    if (resolved) {
      db.upsert(uid, { city: resolved.name, province: resolved.province, lat: resolved.lat, lon: resolved.lon });
      await ctx.replyWithHTML(
        `✅ Lokasi diubah ke: <b>${resolved.name}</b> (Provinsi: ${resolved.province})`,
        mainMenuKeyboard
      );
    } else {
      db.upsert(uid, { city: text.slice(0, 50), province: '' });
      await ctx.replyWithHTML(`✅ Lokasi diubah ke: <b>${text}</b>`, mainMenuKeyboard);
    }
    return showMyProfile(ctx);
  }

  if (!u) {
    return ctx.reply('Ketik /start untuk mulai pendaftaran.');
  }

  // Alur pendaftaran berdasarkan step
  switch (u.step) {
    case 'name': {
      if (text.length < 2 || text.length > 50) {
        return ctx.reply('Nama terlalu pendek atau terlalu panjang. Masukkan nama panggilanmu (2-50 huruf):');
      }
      db.upsert(uid, { name: text, step: 'age' });
      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👋 Halo <b>${text}</b>!\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👉 <b>Langkah 2:</b> Berapa umur kamu saat ini? 🎂\n` +
        `<i>(Masukkan angka umur dari 18 sampai 80 tahun)</i>`
      );
    }

    case 'age': {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 18 || age > 80) {
        return ctx.reply('⚠️ Umur tidak valid. Masukkan angka umur antara 18 sampai 80 tahun:');
      }
      db.upsert(uid, { age, step: 'gender' });
      return ctx.reply(
        `👉 Langkah 3: Kamu seorang apa? 🚻\n\n(Catatan: Bot hanya mempertemukan Laki-laki dengan Perempuan)`,
        Markup.keyboard([['👨 Laki-laki', '👩 Perempuan']])
          .oneTime()
          .resize()
      );
    }

    case 'gender': {
      let g = null;
      if (text.includes('Laki-laki') || text === '👨 Laki-laki' || text.toLowerCase() === 'laki-laki') g = 'M';
      if (text.includes('Perempuan') || text === '👩 Perempuan' || text.toLowerCase() === 'perempuan') g = 'F';

      if (!g) {
        return ctx.reply(
          'Silakan pilih salah satu tombol jenis kelamin di bawah:',
          Markup.keyboard([['👨 Laki-laki', '👩 Perempuan']])
            .oneTime()
            .resize()
        );
      }

      const lookingFor = g === 'M' ? 'F' : 'M';
      db.upsert(uid, { gender: g, looking_for: lookingFor, step: 'location' });

      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📍 <b>LANGKAH 4: PILIH LOKASI KAMU</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Pilih salah satu opsi lokasi:\n` +
        `1. <b>Tombol GPS:</b> Tekan [📍 Kirim Lokasi GPS Saya] di bawah (pastikan GPS HP aktif).\n` +
        `2. <b>Tombol Wilayah:</b> Tekan [🗺️ Pilih Provinsi / Kota] di bawah.\n` +
        `3. <b>Ketik Nama Kota/Daerah:</b> Langsung ketik di kolom pesan (misal: <code>Nias</code>, <code>Medan</code>, <code>Jakarta</code>, <code>Bandung</code>, dll).\n`,
        locationKeyboard
      );
    }

    case 'location': {
      if (text === '🗺️ Pilih Provinsi / Kota') {
        return ctx.replyWithHTML(
          `🗺️ <b>PILIH WILAYAH / PROVINSI KAMU:</b>\n\nKlik salah satu wilayah di bawah:`,
          Markup.inlineKeyboard(PROVINCE_BUTTONS)
        );
      }

      // Deteksi lokasi cerdas (case-insensitive & pemetaan provinsi)
      const resolved = db.resolveLocation(text);
      if (resolved) {
        db.upsert(uid, {
          city: resolved.name,
          province: resolved.province,
          lat: resolved.lat,
          lon: resolved.lon,
          step: 'bio',
        });
      } else {
        db.upsert(uid, {
          city: text.slice(0, 50),
          province: '',
          step: 'bio',
        });
      }

      const displayName = resolved ? `${resolved.name} (${resolved.province})` : text;

      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📍 <b>LOKASI TERSIMPAN:</b> ${displayName}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👉 <b>Langkah 5:</b> Tulis bio / deskripsi singkat tentang dirimu (hobi, musik, kriteria pasangan) ✍️:\n\n` +
        `<i>Contoh: 'Suka traveling, ngopi santai, cari temen ngobrol asik yang sefrekuensi.'</i>`,
        Markup.keyboard([['Lewati Bio ⏩']]).oneTime().resize()
      );
    }

    case 'bio': {
      let bioText = '';
      if (!text.includes('Lewati')) {
        bioText = text.slice(0, 300);
      }
      db.upsert(uid, { bio: bioText, step: 'photos' });

      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📸 <b>LANGKAH 6: FOTO PROFIL ASLI</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `⚠️ <b>Persyaratan Wajib:</b>\n` +
        `• Upload minimal <b>2 foto asli wajah kamu</b> (maksimal 5 foto).\n` +
        `• Foto diperiksa Admin untuk menjamin keaslian akun.\n\n` +
        `Kirim foto pertamamu sekarang! 👇`,
        Markup.removeKeyboard()
      );
    }

    case 'photos': {
      const photos = photoList(u);
      return ctx.reply(
        `Kamu baru mengunggah ${photos.length} foto. Silakan kirim minimal 2 foto asli wajah kamu ya!`
      );
    }

    case 'voice': {
      return ctx.replyWithHTML(
        `🎙️ <b>Langkah Terakhir: Rekam Suara Asli (Voice Note)</b>\n\n` +
        `Tahan ikon mikrofon di pojok kanan bawah, ucapkan kalimat singkat (3-10 detik):\n` +
        `<i>"Halo, nama saya ${u.name}, ini suara dan akun asli saya di Mutual Lovely."</i>\n` +
        `lalu lepaskan untuk mengirim pesan suara.`
      );
    }

    default:
      break;
  }
});

// Aksi Pemilihan Lokasi dari tombol inline
userBot.action(/^set_loc:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const locKey = ctx.match[1];
  const uid = ctx.from.id;
  const resolved = db.INDONESIA_LOCATIONS[locKey] || db.resolveLocation(locKey);

  if (resolved) {
    db.upsert(uid, {
      city: resolved.name,
      province: resolved.province,
      lat: resolved.lat,
      lon: resolved.lon,
    });

    await ctx.editMessageText(
      `📍 Lokasi disetel ke: <b>${resolved.name}</b> (Provinsi: ${resolved.province})`,
      { parse_mode: 'HTML' }
    );

    const state = userState.get(uid);
    if (state && state.action === 'edit_location') {
      userState.delete(uid);
      await ctx.reply('Lokasimu berhasil diperbarui!', mainMenuKeyboard);
      return showMyProfile(ctx);
    }

    const u = db.getUser(uid);
    if (u && u.step === 'location') {
      db.upsert(uid, { step: 'bio' });
      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📍 <b>LOKASI TERSIMPAN:</b> ${resolved.name} (${resolved.province})\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👉 <b>Langkah 5:</b> Tulis bio / deskripsi singkat tentang dirimu ✍️:\n\n` +
        `<i>Contoh: 'Suka ngopi santai, dengerin musik indie, cari temen ngobrol asik.'</i>`,
        Markup.keyboard([['Lewati Bio ⏩']]).oneTime().resize()
      );
    }
  }
});

userBot.action('prompt_type_city', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Silakan langsung ketik nama kotamu di kolom pesan (misal: Medan, Nias, Bandung, Solo, dll):');
});

// Fitur Cari Pasangan Terdekat (Nearby)
async function showNearbyCandidate(ctx) {
  const uid = ctx.from.id;
  const me = db.getUser(uid);
  if (!me || me.step !== 'done') {
    return ctx.reply('Profilmu belum lengkap. Ketik /start untuk melengkapi profil.');
  }

  if (me.lat == null || me.lon == null) {
    return ctx.replyWithHTML(
      `📍 <b>Lokasi GPS / Kota belum tersimpan!</b>\n\n` +
      `Untuk mencari pasangan terdekat, bot membutuhkan lokasi kotamu.\n` +
      `Klik tombol di bawah untuk menyetel lokasimu:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📍 Update Lokasi Saya', 'edit_field:location')],
        [Markup.button.callback('🗺️ Pilih Wilayah / Provinsi', 'menu_select_province')],
      ])
    );
  }

  return showCandidate(ctx, uid, true);
}

userBot.action('menu_select_province', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.replyWithHTML('🗺️ <b>PILIH WILAYAH / PROVINSIMU:</b>', Markup.inlineKeyboard(PROVINCE_BUTTONS));
});

// Tampilkan Kandidat (Fitur Cari Pasangan mirip LeoMatch)
async function showCandidate(ctx, uid, onlyNearby = false) {
  const me = db.getUser(uid);
  if (!me || me.step !== 'done') {
    return ctx.reply('Profilmu belum lengkap. Ketik /start untuk melengkapi profil terlebih dahulu.');
  }

  if (me.status === 'rejected') {
    return ctx.replyWithHTML(
      `⚠️ <b>Profil kamu sebelumnya ditolak oleh admin</b> dengan alasan:\n` +
      `<i>"${me.reject_reason || 'Foto/suara tidak memenuhi syarat'}"</i>\n\n` +
      `Ketik /start untuk mengisi ulang dan mengunggah data baru yang asli.`
    );
  }

  const { cand, dist, isIncomingLike, isNearby, sameCity, sameProvince } = db.nextCandidate(me, onlyNearby);

  if (!cand) {
    const emptyMsg = onlyNearby
      ? `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 <b>BELUM ADA KANDIDAT DI SEKITARMU</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Belum ada pasangan baru di sekitarmu saat ini.\n` +
      `Kamu bisa mencoba pencarian reguler atau reset riwayat lewati:`
      : `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 <b>KANDIDAT BELUM TERSEDIA LAGI</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Belum ada profil baru yang cocok saat ini.\n` +
      `Ingin melihat kembali orang-orang yang sebelumnya pernah kamu lewati?`;

    return ctx.replyWithHTML(
      emptyMsg,
      Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Reset Profil yang Dilewati', 'reset_seen')],
        [Markup.button.callback('❤️ Cari Pasangan Reguler', 'search_regular')],
      ])
    );
  }

  const cPhotos = photoList(cand);
  const mainPhoto = cPhotos[0];
  const candBadge = cand.status === 'verified' ? '✅ Terverifikasi Asli' : '⏳ Menunggu Verifikasi';

  // Format label lokasi yang rapi & jelas
  let locationInfo = '';
  if (sameCity) {
    locationInfo = `• <b>Lokasi:</b> ${cand.city || 'Satu Kota'} (📍 Satu Kota Denganmu!)`;
  } else if (sameProvince) {
    locationInfo = `• <b>Lokasi:</b> ${cand.city || '-'}` +
      (cand.province ? ` (Satu Provinsi: ${cand.province})` : '');
  } else {
    locationInfo = `• <b>Lokasi:</b> ${cand.city || 'Indonesia'}` +
      (cand.province ? ` (${cand.province})` : '');
  }

  const distanceInfo = dist != null ? `• <b>Jarak:</b> ±${dist.toFixed(1)} km dari posisimu\n` : '';

  let headerTitle = `━━━━━━━━━━━━━━━━━━━━\n✨ <b>KANDIDAT PASANGAN</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (isNearby) {
    headerTitle = `━━━━━━━━━━━━━━━━━━━━\n📍 <b>PASANGAN TERDEKAT DI SEKITARMU</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  } else if (isIncomingLike) {
    headerTitle = `━━━━━━━━━━━━━━━━━━━━\n❤️ <b>DIA MENYUKAI PROFIL KAMU!</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  }

  let caption =
    headerTitle +
    `• <b>Nama:</b> ${cand.name} (${cand.age} thn) ${cand.gender === 'M' ? '👨' : '👩'}\n` +
    `${locationInfo}\n` +
    `${distanceInfo}` +
    `• <b>Status:</b> ${candBadge}\n\n`;

  if (cand.bio) {
    caption += `📝 <b>Bio:</b>\n<i>"${cand.bio}"</i>\n\n`;
  }

  if (isIncomingLike && cand.like_message) {
    caption += `💬 <b>Pesan dari dia:</b>\n<i>"${cand.like_message}"</i>\n\n`;
  }

  if (cPhotos.length > 1) {
    caption += `📸 <i>Foto 1 dari ${cPhotos.length}</i>\n`;
  }
  caption += `━━━━━━━━━━━━━━━━━━━━`;

  const buttons = [
    [
      Markup.button.callback('❤️ Suka', `like:${cand.tg_id}`),
      Markup.button.callback('💌 Kirim Pesan', `msg:${cand.tg_id}`),
      Markup.button.callback('👎 Lewati', `skip:${cand.tg_id}`),
    ],
  ];

  if (cPhotos.length > 1) {
    buttons.push([Markup.button.callback(`🖼️ Foto Selanjutnya (1/${cPhotos.length})`, `photo:${cand.tg_id}:1`)]);
  }
  buttons.push([Markup.button.callback('⏸️ Selesai Mencari', 'stop_search')]);

  try {
    if (mainPhoto) {
      await ctx.telegram.sendPhoto(uid, mainPhoto, {
        caption,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons),
      });
    } else {
      await ctx.telegram.sendMessage(uid, caption, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons),
      });
    }
  } catch (err) {
    console.error('Error saat menampilkan kandidat:', err.message);
    db.addSkip(uid, cand.tg_id);
    return showCandidate(ctx, uid, onlyNearby);
  }
}

userBot.action('search_regular', async (ctx) => {
  await ctx.answerCbQuery();
  return showCandidate(ctx, ctx.from.id, false);
});

// Interaksi tombol inline Like / Skip / Message
userBot.action(/^like:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('❤️ Kamu menyukai profil ini!');
  const meId = ctx.from.id;
  const targetId = Number(ctx.match[1]);

  const { isMatch, partnerMessage } = db.addLike(meId, targetId);

  await ctx.editMessageReplyMarkup(undefined).catch(() => { });

  if (isMatch) {
    await sendMatchNotification(meId, targetId, '', partnerMessage);
  } else {
    // Beritahu target bahwa ada yang menyukainya
    userBot.telegram
      .sendMessage(
        targetId,
        `❤️ <b>Seseorang baru saja menyukai profilmu!</b>\n` +
        `Buka bot dan ketik /cari untuk melihat siapa yang menyukaimu 😉`,
        { parse_mode: 'HTML' }
      )
      .catch(() => { });
  }

  return showCandidate(ctx, meId, false);
});

userBot.action(/^msg:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const meId = ctx.from.id;
  const targetId = Number(ctx.match[1]);
  const target = db.getUser(targetId);

  userState.set(meId, { action: 'await_like_message', targetId });
  await ctx.editMessageReplyMarkup(undefined).catch(() => { });

  await ctx.replyWithHTML(
    `💌 <b>Kirim Pesan ke ${target ? target.name : 'dia'}:</b>\n\n` +
    `Tulis pujian atau sapaan yang ingin kamu sampaikan:\n` +
    `<i>(Contoh: 'Hai ${target ? target.name : ''}, senyummu manis banget! Boleh kenalan?')</i>\n\n` +
    `Ketik pesanmu di bawah atau ketik /batal:`,
    Markup.keyboard([['❌ Batal']]).resize()
  );
});

userBot.action(/^skip:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('👎 Dilewati');
  const meId = ctx.from.id;
  const targetId = Number(ctx.match[1]);

  db.addSkip(meId, targetId);
  await ctx.editMessageReplyMarkup(undefined).catch(() => { });
  return showCandidate(ctx, meId, false);
});

// Paginasi foto kandidat
userBot.action(/^photo:(\d+):(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  const photoIndex = Number(ctx.match[2]);
  const target = db.getUser(targetId);

  if (!target) return ctx.answerCbQuery('Profil tidak ditemukan.');
  const photos = photoList(target);
  if (photoIndex >= photos.length || photoIndex < 0) return ctx.answerCbQuery();

  await ctx.answerCbQuery();
  const currentPhoto = photos[photoIndex];
  const nextIdx = (photoIndex + 1) % photos.length;

  const buttons = [
    [
      Markup.button.callback('❤️ Suka', `like:${target.tg_id}`),
      Markup.button.callback('💌 Kirim Pesan', `msg:${target.tg_id}`),
      Markup.button.callback('👎 Lewati', `skip:${target.tg_id}`),
    ],
    [Markup.button.callback(`🖼️ Foto Selanjutnya (${photoIndex + 1}/${photos.length})`, `photo:${target.tg_id}:${nextIdx}`)],
    [Markup.button.callback('⏸️ Selesai Mencari', 'stop_search')],
  ];

  try {
    await ctx.editMessageMedia(
      {
        type: 'photo',
        media: currentPhoto,
        caption: ctx.callbackQuery.message.caption || '',
        parse_mode: 'HTML',
      },
      { ...Markup.inlineKeyboard(buttons) }
    );
  } catch (e) {
    // Ignore media edit errors if identical
  }
});

userBot.action('reset_seen', async (ctx) => {
  await ctx.answerCbQuery('Riwayat lewati di-reset!');
  db.resetSeen(ctx.from.id);
  await ctx.editMessageText('🔄 Riwayat telah direset! Menampilkan kembali kandidat di sekitarmu...').catch(() => { });
  return showCandidate(ctx, ctx.from.id, false);
});

userBot.action('stop_search', async (ctx) => {
  await ctx.answerCbQuery('Pencarian dihentikan');
  await ctx.editMessageReplyMarkup(undefined).catch(() => { });
  await ctx.reply('Pencarian dihentikan. Ketik /cari kapan pun kamu ingin mencari pasangan lagi! 😊', mainMenuKeyboard);
});

// Helper: Buat link chat Telegram dengan draft otomatis berisi NAMA KITA (Pengirim)
// PENTING: Draft harus berisi nama user yang membuka link (pengirim sapaan),
// BUKAN nama partner yang diajak chat!
// Contoh: Rio chat ke Sarah -> Pesan draft berbunyi: "Hai... aku Rio dari Mutual Love 👋"
function createChatLink(meUser, partnerUser) {
  const myName = meUser && meUser.name ? meUser.name.trim() : 'saya';
  const draft = encodeURIComponent(`Hai... aku ${myName} dari Mutual Love 👋`);

  if (partnerUser && partnerUser.username) {
    const cleanUsername = partnerUser.username.replace(/^@/, '');
    const chatUrl = `https://t.me/${cleanUsername}?text=${draft}`;
    return {
      chatUrl,
      contactHtml: `<a href="${chatUrl}">@${cleanUsername}</a>`,
    };
  }

  const tgUrl = partnerUser ? `tg://user?id=${partnerUser.tg_id}` : '#';
  return {
    chatUrl: tgUrl,
    contactHtml: '<i>(Gunakan link chat di bawah)</i>',
  };
}

// Kirim Notifikasi Match (Saling Suka) ke Kedua User
// TIDAK MENAMPILKAN ID TELEGRAM ANGKA KE USER
// DILENGKAPI DRAFT PESAN OTOMATIS: "Hai... aku [Nama Sendiri] dari Mutual Love 👋"
async function sendMatchNotification(user1Id, user2Id, msg1 = '', msg2 = '') {
  const u1 = db.getUser(user1Id);
  const u2 = db.getUser(user2Id);
  if (!u1 || !u2) return;

  // Untuk User 1:
  // - Penerima notifikasi & pengirim pesan = u1 (nama di draft: u1.name)
  // - Partner yang dituju = u2 (@u2.username)
  const chatForU1 = createChatLink(u1, u2);

  // Untuk User 2:
  // - Penerima notifikasi & pengirim pesan = u2 (nama di draft: u2.name)
  // - Partner yang dituju = u1 (@u1.username)
  const chatForU2 = createChatLink(u2, u1);

  // Kirim ke User 1
  const textFor1 =
    `💘━━━━━━━━━━━━━━━━━━━💘\n` +
    `   🎉 <b>IT'S A MATCH!</b> 🎉\n` +
    ` <b>KALIAN SALING MENYUKAI!</b>\n` +
    `💘━━━━━━━━━━━━━━━━━━━💘\n\n` +
    `Selamat! Kamu dan <b>${u2.name}</b> (${u2.age} thn) saling cocok!\n\n` +
    `• <b>Lokasi:</b> ${u2.city || 'Indonesia'}` +
    (u2.province ? ` (${u2.province})` : '') +
    `\n` +
    (msg2 ? `• <b>Pesan dari dia:</b> <i>"${msg2}"</i>\n` : '') +
    `• <b>Kontak:</b> ${chatForU1.contactHtml}\n\n` +
    `👉 <a href="${chatForU1.chatUrl}"><b>Klik di Sini untuk Chat dengan ${u2.name}</b></a>\n\n` +
    `<i>Ayo sapa dan mulai kenalan sekarang! 😊</i>`;

  // Kirim ke User 2
  const textFor2 =
    `💘━━━━━━━━━━━━━━━━━━━💘\n` +
    `   🎉 <b>IT'S A MATCH!</b> 🎉\n` +
    ` <b>KALIAN SALING MENYUKAI!</b>\n` +
    `💘━━━━━━━━━━━━━━━━━━━💘\n\n` +
    `Selamat! Kamu dan <b>${u1.name}</b> (${u1.age} thn) saling cocok!\n\n` +
    `• <b>Lokasi:</b> ${u1.city || 'Indonesia'}` +
    (u1.province ? ` (${u1.province})` : '') +
    `\n` +
    (msg1 ? `• <b>Pesan dari dia:</b> <i>"${msg1}"</i>\n` : '') +
    `• <b>Kontak:</b> ${chatForU2.contactHtml}\n\n` +
    `👉 <a href="${chatForU2.chatUrl}"><b>Klik di Sini untuk Chat dengan ${u1.name}</b></a>\n\n` +
    `<i>Ayo sapa dan mulai kenalan sekarang! 😊</i>`;

  await userBot.telegram.sendMessage(user1Id, textFor1, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => { });
  await userBot.telegram.sendMessage(user2Id, textFor2, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => { });
}

// -------------------------------------------------------------
// MENU GAME - AJAK PASANGAN MAIN GAME BARENG
// -------------------------------------------------------------
async function showGameMenu(ctx) {
  const uid = ctx.from.id;
  const me = db.getUser(uid);

  if (!me || me.step !== 'done') {
    return ctx.reply('Profilmu belum lengkap. Ketik /start untuk melengkapi profil.');
  }

  const matches = db.getMatches(uid);

  if (matches.length === 0) {
    return ctx.replyWithHTML(
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎮 <b>BELUM ADA PASANGAN GAME</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Kamu belum punya pasangan yang saling suka.\n` +
      `Cari pasangan dulu di <b>❤️ Cari Pasangan</b> dan tunggu sampai kalian saling suka! 💘`,
      mainMenuKeyboard
    );
  }

  const text =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 <b>MENU GAME BARENG</b> 🕹️\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih pasangan yang mau kamu ajak main game:\n\n` +
    `🎯 <b>Game Tersedia:</b>\n` +
    `• ❌⭕ Tic-Tac-Toe\n` +
    `• ✊✋✌️ Batu Gunting Kertas\n` +
    `• 🎲 Truth or Dare\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Pilih partner di bawah:`;

  const buttons = matches.map((m) => [
    Markup.button.callback(`💘 ${m.name} (${m.age} thn)`, `gm:${m.tg_id}`),
  ]);

  return ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
}

// -------------------------------------------------------------
// MENU RIWAYAT SUKA & MATCH
// -------------------------------------------------------------
async function showHistoryMenu(ctx) {
  const uid = ctx.from.id;
  const matches = db.getMatches(uid);
  const incoming = db.getIncomingLikes(uid);

  const text =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💌 <b>RIWAYAT MATCH & SUKA</b> 💘\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `• <b>Saling Suka (Matches):</b> ${matches.length} orang\n` +
    `• <b>Orang yang Menyukai Kamu:</b> ${incoming.length} orang\n\n` +
    `Pilih menu yang ingin kamu lihat:`;

  const buttons = [
    [Markup.button.callback(`💘 Saling Suka / Match (${matches.length})`, 'view_matches')],
    [Markup.button.callback(`😍 Orang yang Suka Kamu (${incoming.length})`, 'view_incoming_likes')],
  ];

  return ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
}

userBot.action('view_matches', async (ctx) => {
  await ctx.answerCbQuery();
  const uid = ctx.from.id;
  const me = db.getUser(uid);
  const matches = db.getMatches(uid);

  if (matches.length === 0) {
    return ctx.replyWithHTML(
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💘 <b>BELUM ADA MATCH</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Belum ada pasangan yang saling suka saat ini.\n` +
      `Terus aktif mencari pasangan di <b>❤️ Cari Pasangan</b> ya!`,
      mainMenuKeyboard
    );
  }

  let text =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💘 <b>DAFTAR USER YANG SALING COCOK (${matches.length})</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  const gameButtons = [];

  for (let i = 0; i < matches.length; i++) {
    const partner = matches[i];
    // me adalah pengirim (nama kita di draft), partner adalah orang yang diajak chat
    const chat = createChatLink(me, partner);

    text +=
      `<b>${i + 1}. ${partner.name}</b> (${partner.age} thn)\n` +
      `• <b>Lokasi:</b> ${partner.city || 'Indonesia'}` +
      (partner.province ? ` (${partner.province})` : '') +
      `\n` +
      `• <b>Kontak:</b> ${chat.contactHtml}\n` +
      `👉 <a href="${chat.chatUrl}"><b>Chat dengan ${partner.name}</b></a>\n\n`;

    // Tambahkan tombol game per partner
    gameButtons.push(
      [Markup.button.callback(`🎮 Main Game dengan ${partner.name}`, `gm:${partner.tg_id}`)]
    );
  }

  if (gameButtons.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━\n🎮 <b>AJAK MAIN GAME:</b>\n`;
    return ctx.replyWithHTML(text, {
      disable_web_page_preview: true,
      ...Markup.inlineKeyboard(gameButtons),
    });
  }
  return ctx.replyWithHTML(text, { disable_web_page_preview: true });
});

userBot.action('view_incoming_likes', async (ctx) => {
  await ctx.answerCbQuery();
  const uid = ctx.from.id;
  const incoming = db.getIncomingLikes(uid);

  if (incoming.length === 0) {
    return ctx.replyWithHTML(
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `😍 <b>BELUM ADA YANG LIKE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Belum ada orang baru yang menyukai profilmu saat ini.\n` +
      `Yuk aktif mencari pasangan dengan klik <b>❤️ Cari Pasangan</b> agar profilmu sering muncul!`,
      mainMenuKeyboard
    );
  }

  return showCandidate(ctx, uid, false);
});

// -------------------------------------------------------------
// MENU PROFIL SAYA & EDIT PROFIL INTERAKTIF
// -------------------------------------------------------------
async function showMyProfile(ctx) {
  const uid = ctx.from.id;
  const u = db.getUser(uid);
  if (!u || u.step !== 'done') {
    return ctx.reply('Profilmu belum lengkap. Ketik /start untuk melengkapi profil.');
  }

  const photos = photoList(u);
  const statusBadge =
    u.status === 'verified'
      ? '✅ Terverifikasi Asli (Centang Biru)'
      : u.status === 'pending'
        ? '⏳ Menunggu Verifikasi Admin'
        : '❌ Ditolak';

  const caption =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>PROFIL PENGGUNA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `• <b>Nama:</b> ${u.name}\n` +
    `• <b>Usia:</b> ${u.age} tahun\n` +
    `• <b>Gender:</b> ${u.gender === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'}\n` +
    `• <b>Mencari:</b> ${u.looking_for === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'}\n` +
    `• <b>Lokasi:</b> ${u.city || '-'}` +
    (u.province ? ` (${u.province})` : '') +
    `\n` +
    `• <b>Foto:</b> ${photos.length} foto tersimpan\n` +
    `• <b>Suara:</b> ${u.voice ? '✅ Terverifikasi' : '⚠️ Belum Ada'}\n` +
    `• <b>Status:</b> ${statusBadge}\n` +
    (u.status === 'rejected' ? `\n⚠️ <i>Alasan Penolakan: ${u.reject_reason}</i>\n` : '\n') +
    (u.bio ? `📝 <b>Bio:</b>\n<i>"${u.bio}"</i>\n\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━`;

  const buttons = [
    [Markup.button.callback('✏️ Edit Bagian Profil', 'open_edit_menu')],
    [Markup.button.callback('🗑️ Hapus Akun & Data Saya', 'delete_account')],
  ];

  if (photos[0]) {
    await ctx.replyWithPhoto(photos[0], { caption, parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } else {
    await ctx.replyWithHTML(caption, Markup.inlineKeyboard(buttons));
  }
}

userBot.action('open_edit_menu', (ctx) => showEditMenu(ctx));

function showEditMenu(ctx) {
  const text =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✏️ <b>EDIT DATA PROFIL</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih bagian data yang ingin kamu ubah tanpa perlu mengulang dari awal:`;

  const buttons = [
    [Markup.button.callback('✏️ Ubah Nama', 'edit_field:name'), Markup.button.callback('🎂 Ubah Umur', 'edit_field:age')],
    [Markup.button.callback('🚻 Ubah Gender', 'edit_field:gender'), Markup.button.callback('📍 Ubah Lokasi / Kota', 'edit_field:location')],
    [Markup.button.callback('📝 Ubah Bio', 'edit_field:bio'), Markup.button.callback('📸 Ganti Foto Profil', 'edit_field:photos')],
    [Markup.button.callback('🎙️ Rekam Ulang Suara (VN)', 'edit_field:voice')],
    [Markup.button.callback('🔙 Kembali ke Profil', 'back_to_profile')],
  ];

  if (ctx.callbackQuery) {
    ctx.answerCbQuery();
    return ctx.editMessageCaption
      ? ctx.editMessageCaption(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) })
      : ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
  }
  return ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
}

userBot.action('back_to_profile', async (ctx) => {
  await ctx.answerCbQuery();
  return showMyProfile(ctx);
});

// Aksi Edit Tiap Field
userBot.action(/^edit_field:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const field = ctx.match[1];
  const uid = ctx.from.id;

  switch (field) {
    case 'name':
      userState.set(uid, { action: 'edit_name' });
      return ctx.reply('Silakan ketik nama barumu:');

    case 'age':
      userState.set(uid, { action: 'edit_age' });
      return ctx.reply('Silakan masukkan angka umur barumu (18-80):');

    case 'gender':
      return ctx.reply(
        'Pilih jenis kelaminmu:',
        Markup.inlineKeyboard([
          [Markup.button.callback('👨 Laki-laki (Mencari Perempuan)', 'set_gender:M')],
          [Markup.button.callback('👩 Perempuan (Mencari Laki-laki)', 'set_gender:F')],
        ])
      );

    case 'location':
      userState.set(uid, { action: 'edit_location' });
      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📍 <b>UBAH LOKASI TEMPAT TINGGALMU</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Pilih salah satu opsi:\n` +
        `1. <b>Tombol GPS:</b> Tekan [📍 Kirim Lokasi GPS Saya] di bawah (pastikan GPS HP aktif).\n` +
        `2. <b>Tombol Wilayah:</b> Tekan tombol wilayah di bawah.\n` +
        `3. <b>Ketik Manual:</b> Langsung ketik nama kota/daerahmu (misal: <code>Nias</code>, <code>Medan</code>, <code>Bandung</code>, dll).\n`,
        locationKeyboard
      );

    case 'bio':
      userState.set(uid, { action: 'edit_bio' });
      return ctx.reply('Silakan ketik bio / deskripsi barumu (atau ketik /hapusbio untuk mengosongkan):');

    case 'photos':
      userState.set(uid, { action: 'edit_photos', newPhotos: [] });
      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📸 <b>UPLOAD FOTO PROFIL BARU</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Silakan kirim minimal <b>2 foto asli wajah kamu yang baru</b> (maksimal 5 foto).`
      );

    case 'voice':
      userState.set(uid, { action: 'edit_voice' });
      return ctx.replyWithHTML(
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎙️ <b>REKAM ULANG SUARA VERIFIKASI</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Tahan tombol mikrofon, ucapkan kalimat pendek (3-10 detik):\n` +
        `<i>"Halo, ini suara asli saya di Mutual Lovely"</i>\n` +
        `lalu lepaskan untuk mengirim.`
      );

    default:
      break;
  }
});

userBot.action(/^set_gender:(M|F)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const g = ctx.match[1];
  const lookingFor = g === 'M' ? 'F' : 'M';
  db.upsert(ctx.from.id, { gender: g, looking_for: lookingFor });
  await ctx.reply(
    `✅ Jenis kelamin diubah menjadi: <b>${g === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'}</b>`,
    { parse_mode: 'HTML', ...mainMenuKeyboard }
  );
  return showMyProfile(ctx);
});

userBot.action('delete_account', async (ctx) => {
  await ctx.answerCbQuery();
  db.deleteUser(ctx.from.id);
  await ctx.reply('Akunmu dan semua data foto serta riwayat match telah berhasil dihapus.', Markup.removeKeyboard());
});

// Menu Bantuan yang Rapi & Sejajar
function showHelpMenu(ctx) {
  const helpText =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📖 <b>PANDUAN LENGKAP MUTUAL LOVELY</b> ❤️\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `❤️ <b>Cari Pasangan (/cari)</b>\n` +
    `Jelajahi profil kandidat lawan jenis yang cocok.\n\n` +
    `📍 <b>Cari di Sekitar (/sekitar)</b>\n` +
    `Mencari pasangan terdekat dari posisimu (km) atau satu provinsi denganmu.\n\n` +
    `💌 <b>Riwayat Suka & Match (/riwayat)</b>\n` +
    `Lihat daftar orang yang saling suka (Match) dan siapa saja yang menyukaimu.\n\n` +
    `👤 <b>Profil Saya (/profil)</b>\n` +
    `Lihat tampilan profilmu, centang biru, dan pengaturan data diri.\n\n` +
    `✏️ <b>Edit Profil (/edit)</b>\n` +
    `Ubah bagian profil (nama, umur, lokasi, bio, foto, suara) tanpa perlu ulang dari awal.\n\n` +
    `🎮 <b>Main Game (/game)</b>\n` +
    `Ajak pasangan yang sudah saling suka main game bareng!\n` +
    `Game tersedia: Tic-Tac-Toe, Batu Gunting Kertas, Truth or Dare.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ <b>Verifikasi Keaslian Gender:</b>\n` +
    `Admin memeriksa <b>foto asli</b> dan <b>rekaman suara</b> kamu untuk menjamin tidak ada akun bot atau palsu.`;

  return ctx.replyWithHTML(helpText, mainMenuKeyboard);
}

// -------------------------------------------------------------
// FUNGSI PENGIRIMAN DATA KE BOT ADMIN (BOT 2)
// -------------------------------------------------------------
async function sendToAdmin(u, photoIds, voiceId = '') {
  const adminIds = db.getAdminIds(process.env.ADMIN_IDS);
  if (adminIds.length === 0) {
    console.log(
      '⚠️ [AdminBot] Belum ada admin terdaftar! Buka bot admin @MutualanVeryfiedBot lalu ketik /start untuk mendaftar sebagai admin.'
    );
    return;
  }

  const uname = u.username ? `@${u.username}` : '<i>(Tidak ada username)</i>';
  const caption =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>PENGAJUAN VERIFIKASI USER BARU</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `• <b>Telegram ID:</b> <code>${u.tg_id}</code>\n` +
    `• <b>Username:</b> ${uname}\n` +
    `• <b>Nama:</b> <b>${u.name}</b>\n` +
    `• <b>Usia:</b> <b>${u.age} tahun</b>\n` +
    `• <b>Gender:</b> <b>${u.gender === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'}</b>\n` +
    `• <b>Mencari:</b> <b>${u.looking_for === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'}</b>\n` +
    `• <b>Lokasi:</b> ${u.city || '-'}` +
    (u.province ? ` (${u.province})` : '') +
    (u.lat ? ` [${u.lat.toFixed(4)}, ${u.lon.toFixed(4)}]` : '') +
    `\n` +
    `• <b>Bio:</b> ${u.bio || '-'}\n` +
    `• <b>Total Foto Asli:</b> <b>${photoIds.length} foto</b>\n` +
    `• <b>Verifikasi Suara:</b> ${voiceId ? '✅ Ada (Dengarkan di bawah)' : '❌ Tidak Ada'}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Periksa foto dan dengarkan suara user untuk memastikan kesesuaian gender asli:</i>`;

  // 1. Unduh foto-foto dari Bot 1 agar bisa dikirimkan oleh Bot 2
  const media = [];
  for (let i = 0; i < photoIds.length; i++) {
    try {
      const link = await userBot.telegram.getFileLink(photoIds[i]);
      const res = await fetch(link.href);
      const buf = Buffer.from(await res.arrayBuffer());
      media.push({
        type: 'photo',
        media: { source: buf },
        ...(i === 0 ? { caption, parse_mode: 'HTML' } : {}),
      });
    } catch (err) {
      console.error(`Gagal mengunduh foto ${photoIds[i]}:`, err.message);
    }
  }

  // 2. Unduh voice note jika ada
  let voiceBuf = null;
  if (voiceId) {
    try {
      const vLink = await userBot.telegram.getFileLink(voiceId);
      const vRes = await fetch(vLink.href);
      voiceBuf = Buffer.from(await vRes.arrayBuffer());
    } catch (err) {
      console.error(`Gagal mengunduh voice note ${voiceId}:`, err.message);
    }
  }

  for (const adminId of adminIds) {
    try {
      // Kirim album foto
      if (media.length > 0) {
        await adminBot.telegram.sendMediaGroup(adminId, media);
      }

      // Kirim rekaman suara (Voice Note) ke admin
      if (voiceBuf) {
        await adminBot.telegram.sendVoice(
          adminId,
          { source: voiceBuf },
          {
            caption: `🎙️ <b>Rekaman Suara Asli:</b> ${u.name} (Gender: ${u.gender === 'M' ? 'Laki-laki 👨' : 'Perempuan 👩'})`,
            parse_mode: 'HTML',
          }
        );
      }

      // Kirim tombol keputusan verifikasi
      await adminBot.telegram.sendMessage(
        adminId,
        `Keputusan Verifikasi untuk <b>${u.name}</b> (ID: <code>${u.tg_id}</code>):`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Setujui Verifikasi', `verify:${u.tg_id}`),
              Markup.button.callback('❌ Tolak Profil', `reject:${u.tg_id}`),
            ],
          ]),
        }
      );
    } catch (err) {
      console.error(`Gagal mengirim verifikasi ke admin ${adminId}:`, err.message);
    }
  }
}

// -------------------------------------------------------------
// 2. BOT KEDUA (Admin Verifikasi Bot: @MutualanVeryfiedBot)
// -------------------------------------------------------------

adminBot.start(async (ctx) => {
  const adminId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name || '';

  // Daftarkan pengirim sebagai admin
  db.addAdmin(adminId, username);

  const stats = db.getStats();
  const text =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👑 <b>PANEL ADMIN VERIFIKASI</b> (@MutualanVeryfiedBot)\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Akun Admin Anda:\n` +
    `• <b>Nama:</b> ${ctx.from.first_name}\n` +
    `• <b>ID Telegram:</b> <code>${adminId}</code>\n` +
    `• <b>Status:</b> Terdaftar sebagai Admin Penerima Verifikasi\n\n` +
    `Setiap user baru yang mendaftar di @mutuallovelyBot akan dikirimkan ke bot ini lengkap dengan foto asli dan rekaman suaranya.\n\n` +
    `📊 <b>Statistik Pengguna:</b>\n` +
    `• Total User: ${stats.total}\n` +
    `• Laki-laki: ${stats.male} | Perempuan: ${stats.female}\n` +
    `• Menunggu Verifikasi: ${stats.pending}\n` +
    `• Terverifikasi: ${stats.verified}\n` +
    `• Total Matches: ${stats.matches}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<b>Perintah Admin:</b>\n` +
    `/pending - Lihat daftar antrean verifikasi\n` +
    `/stats - Lihat statistik bot\n` +
    `/broadcast &lt;pesan&gt; - Kirim pengumuman ke semua user`;

  return ctx.replyWithHTML(text);
});

adminBot.command('pending', async (ctx) => {
  if (!db.isAdmin(ctx.from.id, process.env.ADMIN_IDS)) {
    return ctx.reply('Akses khusus Admin.');
  }

  const rows = db.db.prepare("SELECT tg_id, name, age, gender, city, province FROM users WHERE status='pending'").all();
  if (rows.length === 0) {
    return ctx.reply('✅ Antrean bersih! Tidak ada user yang menunggu verifikasi saat ini.');
  }

  let text = `📋 <b>Daftar User Menunggu Verifikasi (${rows.length}):</b>\n\n`;
  const inlineButtons = [];

  for (const r of rows) {
    const loc = r.province ? `${r.city || '-'} (${r.province})` : (r.city || '-');
    text += `• ID: <code>${r.tg_id}</code> | <b>${r.name}</b> (${r.age} thn, ${r.gender === 'M' ? '👨' : '👩'}, ${loc})\n`;
    inlineButtons.push([Markup.button.callback(`✅ Setujui ${r.name}`, `verify:${r.tg_id}`)]);
  }

  return ctx.replyWithHTML(text, Markup.inlineKeyboard(inlineButtons));
});

adminBot.command('stats', (ctx) => {
  if (!db.isAdmin(ctx.from.id, process.env.ADMIN_IDS)) {
    return ctx.reply('Akses khusus Admin.');
  }

  const s = db.getStats();
  const text =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>STATISTIK REALTIME MUTUAL LOVELY</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `• <b>Total Pengguna:</b> ${s.total}\n` +
    `• <b>Laki-laki:</b> ${s.male}\n` +
    `• <b>Perempuan:</b> ${s.female}\n\n` +
    `• <b>Menunggu Verifikasi:</b> ${s.pending}\n` +
    `• <b>Terverifikasi:</b> ${s.verified}\n\n` +
    `• <b>Total Like:</b> ${s.likes}\n` +
    `• <b>Total Matches:</b> ${s.matches}`;

  return ctx.replyWithHTML(text);
});

// Broadcast pesan ke seluruh user Bot 1
adminBot.command('broadcast', async (ctx) => {
  if (!db.isAdmin(ctx.from.id, process.env.ADMIN_IDS)) return;
  const msg = ctx.message.text.replace('/broadcast', '').trim();
  if (!msg) return ctx.reply('Gunakan format: /broadcast <isi pesan>');

  const users = db.db.prepare("SELECT tg_id FROM users WHERE step='done'").all();
  let success = 0;
  for (const u of users) {
    try {
      await userBot.telegram.sendMessage(u.tg_id, `📢 <b>PENGUMUMAN RESMI:</b>\n\n${msg}`, { parse_mode: 'HTML' });
      success++;
    } catch (e) { }
  }
  return ctx.reply(`Pesan berhasil dikirim ke ${success} dari ${users.length} pengguna.`);
});

// Aksi Admin: Setujui Verifikasi
adminBot.action(/^verify:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const targetId = Number(ctx.match[1]);
  const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

  db.upsert(targetId, { status: 'verified', reject_reason: '' });
  const u = db.getUser(targetId);

  // Beritahu user di Bot 1
  userBot.telegram
    .sendMessage(
      targetId,
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🌟 <b>PROFIL ANDA TELAH DIVERIFIKASI!</b> 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Selamat! Profil kamu telah resmi disetujui oleh Admin.\n` +
      `Akunmu kini memiliki lencana <b>Terverifikasi Asli (Centang Biru)</b> ✅.\n\n` +
      `Ayo lanjutkan pencarian pasanganmu: /cari atau /sekitar`,
      { parse_mode: 'HTML', ...mainMenuKeyboard }
    )
    .catch(() => { });

  await ctx.editMessageText(
    `✅ <b>USER DIVERIFIKASI!</b>\nID <code>${targetId}</code> (${u ? u.name : ''}) telah DISETUJUI oleh ${adminName}.`,
    { parse_mode: 'HTML' }
  );
});

// Aksi Admin: Tolak Verifikasi
adminBot.action(/^reject:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const targetId = Number(ctx.match[1]);
  const adminId = ctx.from.id;

  adminState.set(adminId, { action: 'await_reject_reason', targetId });

  await ctx.editMessageText(
    `❌ <b>Penolakan Profil User ID ${targetId}</b>\n\n` +
    `Silakan ketik alasan penolakan sebagai balasan pesan teks (contoh: 'Suara tidak sesuai dengan gender', 'Foto bukan wajah asli', 'Foto buram').`,
    { parse_mode: 'HTML' }
  );
});

// Handler Teks Admin Bot (Untuk alasan penolakan)
adminBot.on('text', async (ctx) => {
  const adminId = ctx.from.id;
  const state = adminState.get(adminId);

  if (state && state.action === 'await_reject_reason') {
    adminState.delete(adminId);
    const targetId = state.targetId;
    const reason = ctx.message.text.trim();

    db.upsert(targetId, { status: 'rejected', reject_reason: reason });

    // Notifikasi ke user di Bot 1
    userBot.telegram
      .sendMessage(
        targetId,
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ <b>PEMBERITAHUAN VERIFIKASI</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Mohon maaf, pengajuan profil kamu ditolak oleh admin dengan alasan:\n` +
        `<i>"${reason}"</i>\n\n` +
        `Silakan perbaiki data dan unggah foto/suara profil aslimu dengan mengetik /start.`,
        { parse_mode: 'HTML' }
      )
      .catch(() => { });

    return ctx.replyWithHTML(
      `❌ <b>User ID <code>${targetId}</code> berhasil ditolak.</b>\nAlasan: <i>"${reason}"</i> telah disampaikan ke user.`
    );
  }
});

// -------------------------------------------------------------
// JALANKAN KEDUA BOT SECARA BERSAMAAN
// -------------------------------------------------------------
// Daftarkan modul game ke userBot
games.register(userBot);

userBot.catch((err) => console.error('UserBot Error:', err));
adminBot.catch((err) => console.error('AdminBot Error:', err));

function startBots() {
  userBot.launch()
    .then(() => console.log('UserBot selesai.'))
    .catch((err) => console.error('❌ Gagal menjalankan User Bot:', err.message));
  console.log('✅ Bot Pertama (@mutuallovelyBot) BERJALAN!');

  adminBot.launch()
    .then(() => console.log('AdminBot selesai.'))
    .catch((err) => console.error('❌ Gagal menjalankan Admin Bot:', err.message));
  console.log('✅ Bot Kedua (@MutualanVeryfiedBot) BERJALAN!');

  console.log('🚀 KEDUA BOT TELEGRAM BERHASIL AKTIF DAN SIAP DIGUNAKAN!');
}

startBots();

process.once('SIGINT', () => {
  userBot.stop('SIGINT');
  adminBot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  userBot.stop('SIGTERM');
  adminBot.stop('SIGTERM');
});
