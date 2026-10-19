// Game 2 pemain untuk user yang sudah saling suka (match).
// State game disimpan di memori: kalau bot restart, game yang sedang berjalan hilang.
const { Markup } = require('telegraf');
const db = require('./db');

const games = new Map();
let counter = 1;

const nm = (id) => (db.getUser(id) || {}).name || 'Pasangan';
const LABEL = { xo: 'Tic-Tac-Toe', rps: 'Batu Gunting Kertas', td: 'Truth or Dare' };

function isMatch(a, b) {
  const q = db.db.prepare('SELECT 1 FROM likes WHERE from_id=? AND to_id=?');
  return !!(q.get(a, b) && q.get(b, a));
}

const gameButton = (other) => Markup.button.callback('🎮 Main game', `gm:${other}`);

const gameMenu = (other) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('❌⭕ Tic-Tac-Toe', `inv:xo:${other}`)],
    [Markup.button.callback('✊✋✌️ Batu Gunting Kertas', `inv:rps:${other}`)],
    [Markup.button.callback('🎲 Truth or Dare', `inv:td:${other}`)],
  ]);

// kirim pesan baru ke pemain, atau edit pesan lama kalau sudah ada
async function show(tg, g, playerId, text, extra) {
  try {
    if (g.msgs[playerId]) await tg.editMessageText(playerId, g.msgs[playerId], undefined, text, extra);
    else g.msgs[playerId] = (await tg.sendMessage(playerId, text, extra)).message_id;
  } catch (e) {
    if (!String(e.message).includes('not modified')) console.error('game:', e.message);
  }
}

// ---------------- Tic-Tac-Toe ----------------
const SYM = { X: '❌', O: '⭕' };
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function xoWinner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
}

function xoKeyboard(g) {
  return Markup.inlineKeyboard([0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => {
      const i = r * 3 + c;
      return Markup.button.callback(g.board[i] ? SYM[g.board[i]] : '▫️', `xo:${g.id}:${i}`);
    })));
}

async function xoRender(tg, g) {
  for (let i = 0; i < 2; i++) {
    const p = g.players[i], opp = g.players[1 - i];
    let head;
    if (g.result === 'draw') head = '🤝 Seri!';
    else if (g.result) head = g.result === (i === 0 ? 'X' : 'O') ? '🏆 Kamu menang!' : '😅 Kamu kalah, coba lagi!';
    else head = g.turn === i ? '👉 Giliran kamu' : `⏳ Giliran ${nm(opp)}`;
    const text = `Tic-Tac-Toe\nKamu: ${i === 0 ? SYM.X : SYM.O}  vs  ${nm(opp)}\n\n${head}`;
    await show(tg, g, p, text, xoKeyboard(g));
  }
}

async function xoStart(tg, g) {
  g.board = Array(9).fill(null);
  g.turn = 0; // players[0] = X, jalan duluan
  await xoRender(tg, g);
}

// ---------------- Batu Gunting Kertas ----------------
const RPS = { r: '✊ Batu', s: '✌️ Gunting', p: '✋ Kertas' };
const BEATS = { r: 's', s: 'p', p: 'r' };

async function rpsRender(tg, g) {
  for (let i = 0; i < 2; i++) {
    const p = g.players[i], opp = g.players[1 - i];
    let text = `Batu Gunting Kertas (best of 3)\nSkor: kamu ${g.scores[i]} - ${g.scores[1 - i]} ${nm(opp)}\n`;
    if (g.last) {
      const w = g.last.winner;
      const res = w === -1 ? 'seri' : w === i ? 'kamu menang' : 'kamu kalah';
      text += `\nRonde lalu: ${RPS[g.last.picks[i]]} vs ${RPS[g.last.picks[1 - i]]} → ${res}\n`;
    }
    let extra;
    if (g.status === 'done') {
      text += g.scores[i] > g.scores[1 - i] ? '\n🏆 Kamu juara!' : '\n😅 Kamu kalah, coba lagi!';
    } else {
      text += g.picks[i] ? '\n✅ Pilihanmu tersimpan, menunggu lawan...' : `\nRonde ${g.round}: pilih sekarang 👇`;
      if (!g.picks[i])
        extra = Markup.inlineKeyboard([Object.entries(RPS).map(([k, v]) => Markup.button.callback(v, `rps:${g.id}:${k}`))]);
    }
    await show(tg, g, p, text, extra);
  }
}

async function rpsStart(tg, g) {
  g.scores = [0, 0]; g.round = 1; g.picks = [null, null]; g.last = null;
  await rpsRender(tg, g);
}

// ---------------- Truth or Dare ----------------
const TRUTH = [
  'Apa makanan favoritmu yang tidak akan pernah kamu bosan?',
  'Tempat apa yang paling ingin kamu kunjungi sebelum umur 40?',
  'Apa hal paling lucu yang pernah terjadi padamu?',
  'Seperti apa hari liburan yang sempurna menurutmu?',
  'Apa kebiasaan kecil yang diam-diam kamu sukai dari dirimu sendiri?',
  'Lagu apa yang selalu bikin kamu semangat?',
  'Apa mimpi terbesarmu saat ini?',
  'Hal apa yang paling bikin kamu tertarik pada seseorang?',
  'Film atau series apa yang bisa kamu tonton berulang kali?',
  'Apa pengalaman paling memalukan yang masih bisa kamu tertawakan?',
];
const DARE = [
  'Kirim foto benda di dekatmu sekarang, lawan harus menebak itu apa.',
  'Ceritakan satu fakta unik tentangmu yang belum banyak orang tahu.',
  'Kirim voice note menyanyikan 1 baris lagu favoritmu.',
  'Tulis pantun lucu untuk lawan mainmu.',
  'Kirim emoji yang paling menggambarkan harimu, lalu jelaskan kenapa.',
  'Tiru suara hewan lewat voice note, biar lawan menebak hewan apa.',
  'Ceritakan rencana liburan impianmu dalam 3 kalimat.',
  'Kirim selfie dengan ekspresi paling konyol (kalau kamu nyaman).',
];

const tdKeyboard = (g) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('💬 Truth', `td:${g.id}:t`), Markup.button.callback('🔥 Dare', `td:${g.id}:d`)],
    [Markup.button.callback('🛑 Selesai', `td:${g.id}:end`)],
  ]);

async function tdStart(tg, g) {
  for (const p of g.players)
    await tg.sendMessage(p, '🎲 Truth or Dare dimulai!\nSiapa pun boleh menekan tombol, pertanyaan muncul di chat kalian berdua.', tdKeyboard(g)).catch(() => {});
}

const START = { xo: xoStart, rps: rpsStart, td: tdStart };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------- Handler ----------------
function register(bot) {
  // /game -> daftar match
  bot.command(['game', 'main'], async (ctx) => {
    const me = ctx.from.id;
    const rows = db.db.prepare(`
      SELECT tg_id, name FROM users
      WHERE tg_id IN (SELECT to_id FROM likes WHERE from_id=?)
        AND tg_id IN (SELECT from_id FROM likes WHERE to_id=?)`).all(me, me);
    if (!rows.length) return ctx.reply('Belum ada match. Cari pasangan dulu dengan /cari 💘');
    return ctx.reply('Pilih match yang mau diajak main:',
      Markup.inlineKeyboard(rows.map((r) => [Markup.button.callback(`💘 ${r.name}`, `gm:${r.tg_id}`)])));
  });

  // menu pilih game
  bot.action(/^gm:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const other = Number(ctx.match[1]);
    if (!isMatch(ctx.from.id, other)) return ctx.reply('Kalian belum saling suka.');
    return ctx.reply(`Mau main apa dengan ${nm(other)}?`, gameMenu(other));
  });

  // kirim ajakan
  bot.action(/^inv:(xo|rps|td):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const me = ctx.from.id, type = ctx.match[1], other = Number(ctx.match[2]);
    if (!isMatch(me, other)) return;
    const id = counter++;
    games.set(id, { id, type, players: [me, other], status: 'invited', msgs: {}, createdAt: Date.now() });
    try {
      await ctx.telegram.sendMessage(other, `🎮 ${nm(me)} mengajak kamu main ${LABEL[type]}!`,
        Markup.inlineKeyboard([[
          Markup.button.callback('✅ Terima', `acc:${id}`),
          Markup.button.callback('❌ Tolak', `rej:${id}`),
        ]]));
    } catch {
      games.delete(id);
      return ctx.editMessageText('Ajakan gagal terkirim (pasangan mungkin memblokir bot).');
    }
    return ctx.editMessageText(`Ajakan ${LABEL[type]} terkirim ke ${nm(other)}. Menunggu jawaban...`);
  });

  bot.action(/^acc:(\d+)$/, async (ctx) => {
    const g = games.get(Number(ctx.match[1]));
    if (!g || g.status !== 'invited' || ctx.from.id !== g.players[1])
      return ctx.answerCbQuery('Ajakan sudah kedaluwarsa');
    await ctx.answerCbQuery();
    g.status = 'playing';
    await ctx.editMessageText(`✅ Kamu menerima ajakan ${LABEL[g.type]}!`).catch(() => {});
    await ctx.telegram.sendMessage(g.players[0], `🎉 ${nm(g.players[1])} menerima ajakanmu!`).catch(() => {});
    await START[g.type](ctx.telegram, g);
  });

  bot.action(/^rej:(\d+)$/, async (ctx) => {
    const g = games.get(Number(ctx.match[1]));
    if (!g || g.status !== 'invited' || ctx.from.id !== g.players[1])
      return ctx.answerCbQuery('Ajakan sudah kedaluwarsa');
    await ctx.answerCbQuery();
    games.delete(g.id);
    await ctx.editMessageText('Ajakan ditolak.').catch(() => {});
    await ctx.telegram.sendMessage(g.players[0], `${nm(g.players[1])} belum bisa main sekarang 🙏`).catch(() => {});
  });

  // langkah Tic-Tac-Toe
  bot.action(/^xo:(\d+):(\d)$/, async (ctx) => {
    const g = games.get(Number(ctx.match[1]));
    if (!g || g.status !== 'playing') return ctx.answerCbQuery('Game sudah selesai');
    const i = g.players.indexOf(ctx.from.id);
    if (i < 0) return ctx.answerCbQuery();
    if (g.turn !== i) return ctx.answerCbQuery('Bukan giliranmu');
    const cell = Number(ctx.match[2]);
    if (g.board[cell]) return ctx.answerCbQuery('Kotak sudah terisi');
    await ctx.answerCbQuery();
    g.board[cell] = i === 0 ? 'X' : 'O';
    const w = xoWinner(g.board);
    if (w) { g.result = w; g.status = 'done'; } else g.turn = 1 - g.turn;
    await xoRender(ctx.telegram, g);
  });

  // pilihan Batu Gunting Kertas
  bot.action(/^rps:(\d+):([rsp])$/, async (ctx) => {
    const g = games.get(Number(ctx.match[1]));
    if (!g || g.status !== 'playing') return ctx.answerCbQuery('Game sudah selesai');
    const i = g.players.indexOf(ctx.from.id);
    if (i < 0) return ctx.answerCbQuery();
    if (g.picks[i]) return ctx.answerCbQuery('Kamu sudah memilih');
    await ctx.answerCbQuery();
    g.picks[i] = ctx.match[2];
    if (g.picks[0] && g.picks[1]) {
      const [a, b] = g.picks;
      const winner = a === b ? -1 : BEATS[a] === b ? 0 : 1;
      if (winner >= 0) g.scores[winner]++;
      g.last = { picks: [a, b], winner };
      g.picks = [null, null];
      g.round++;
      if (g.scores[0] === 2 || g.scores[1] === 2) g.status = 'done';
    }
    await rpsRender(ctx.telegram, g);
  });

  // Truth or Dare
  bot.action(/^td:(\d+):(t|d|end)$/, async (ctx) => {
    const g = games.get(Number(ctx.match[1]));
    if (!g || g.status !== 'playing') return ctx.answerCbQuery('Game sudah selesai');
    if (!g.players.includes(ctx.from.id)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    const act = ctx.match[2];
    if (act === 'end') {
      g.status = 'done';
      for (const p of g.players) await ctx.telegram.sendMessage(p, '🛑 Truth or Dare selesai. Seru kan? Ketik /game untuk main lagi.').catch(() => {});
      return;
    }
    const text = act === 't'
      ? `💬 ${nm(ctx.from.id)} memilih TRUTH:\n\n❓ ${pick(TRUTH)}`
      : `🔥 ${nm(ctx.from.id)} memilih DARE:\n\n🎯 ${pick(DARE)}`;
    for (const p of g.players) await ctx.telegram.sendMessage(p, text, tdKeyboard(g)).catch(() => {});
  });

  // bersihkan game lama (> 2 jam) dari memori
  setInterval(() => {
    for (const [id, g] of games) if (Date.now() - g.createdAt > 2 * 3600 * 1000) games.delete(id);
  }, 30 * 60 * 1000).unref();
}

module.exports = { register, gameButton };
