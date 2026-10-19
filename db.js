const Database = require('better-sqlite3');
const db = new Database('dating.db');

db.pragma('journal_mode = WAL');

// Tabel utama
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  tg_id INTEGER PRIMARY KEY,
  username TEXT DEFAULT '',
  lang TEXT DEFAULT 'id',
  name TEXT DEFAULT '',
  age INTEGER DEFAULT 0,
  gender TEXT DEFAULT '',
  looking_for TEXT DEFAULT '',
  city TEXT DEFAULT '',
  province TEXT DEFAULT '',
  lat REAL DEFAULT NULL,
  lon REAL DEFAULT NULL,
  bio TEXT DEFAULT '',
  photos TEXT DEFAULT '',
  voice TEXT DEFAULT '',
  step TEXT DEFAULT 'name',
  status TEXT DEFAULT 'incomplete',
  reject_reason TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS likes(
  from_id INTEGER,
  to_id INTEGER,
  message TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(from_id, to_id)
);

CREATE TABLE IF NOT EXISTS seen(
  from_id INTEGER,
  to_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(from_id, to_id)
);

CREATE TABLE IF NOT EXISTS matches(
  user1_id INTEGER,
  user2_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user1_id, user2_id)
);

CREATE TABLE IF NOT EXISTS admins(
  tg_id INTEGER PRIMARY KEY,
  username TEXT DEFAULT '',
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Migrasi kolom jika tabel lama belum memiliki kolom baru
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
const neededCols = [
  { name: 'city', type: "TEXT DEFAULT ''" },
  { name: 'province', type: "TEXT DEFAULT ''" },
  { name: 'bio', type: "TEXT DEFAULT ''" },
  { name: 'voice', type: "TEXT DEFAULT ''" },
  { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
];
for (const col of neededCols) {
  if (!userColumns.includes(col.name)) {
    db.prepare(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`).run();
  }
}

const likeColumns = db.prepare('PRAGMA table_info(likes)').all().map((c) => c.name);
if (!likeColumns.includes('message')) {
  db.prepare("ALTER TABLE likes ADD COLUMN message TEXT DEFAULT ''").run();
}
if (!likeColumns.includes('created_at')) {
  db.prepare('ALTER TABLE likes ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
}

// Haversine formula (jarak dalam KM)
function haversine(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dp = rad(lat2 - lat1);
  const dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Kamus Lengkap Seluruh Wilayah, Kabupaten, Kota & Provinsi di Indonesia
// Setiap lokasi memiliki info provinsi sehingga pencocokan satu provinsi otomatis bekerja!
const INDONESIA_LOCATIONS = {
  // SUMATERA UTARA
  nias: { name: 'Nias', province: 'Sumatera Utara', lat: 1.1444, lon: 97.5544 },
  'nias selatan': { name: 'Nias Selatan', province: 'Sumatera Utara', lat: 0.5545, lon: 97.8341 },
  'nias utara': { name: 'Nias Utara', province: 'Sumatera Utara', lat: 1.3323, lon: 97.3195 },
  'nias barat': { name: 'Nias Barat', province: 'Sumatera Utara', lat: 1.0592, lon: 97.4589 },
  gunungsitoli: { name: 'Gunungsitoli', province: 'Sumatera Utara', lat: 1.2903, lon: 97.6158 },
  medan: { name: 'Medan', province: 'Sumatera Utara', lat: 3.5952, lon: 98.6722 },
  'deli serdang': { name: 'Deli Serdang', province: 'Sumatera Utara', lat: 3.4167, lon: 98.6833 },
  binjai: { name: 'Binjai', province: 'Sumatera Utara', lat: 3.6006, lon: 98.4856 },
  langkat: { name: 'Langkat', province: 'Sumatera Utara', lat: 3.75, lon: 98.2167 },
  karo: { name: 'Karo / Berastagi', province: 'Sumatera Utara', lat: 3.1167, lon: 98.5 },
  berastagi: { name: 'Berastagi', province: 'Sumatera Utara', lat: 3.1833, lon: 98.5167 },
  simalungun: { name: 'Simalungun', province: 'Sumatera Utara', lat: 2.9667, lon: 99.0667 },
  'pematang siantar': { name: 'Pematang Siantar', province: 'Sumatera Utara', lat: 2.9594, lon: 99.0687 },
  siantar: { name: 'Pematang Siantar', province: 'Sumatera Utara', lat: 2.9594, lon: 99.0687 },
  asahan: { name: 'Asahan / Kisaran', province: 'Sumatera Utara', lat: 2.9833, lon: 99.6167 },
  kisaran: { name: 'Kisaran', province: 'Sumatera Utara', lat: 2.9833, lon: 99.6167 },
  'tanjung balai': { name: 'Tanjung Balai', province: 'Sumatera Utara', lat: 2.9667, lon: 99.8 },
  toba: { name: 'Toba Samosir', province: 'Sumatera Utara', lat: 2.3833, lon: 99.0667 },
  samosir: { name: 'Samosir', province: 'Sumatera Utara', lat: 2.6167, lon: 98.7167 },
  tapanuli: { name: 'Tapanuli', province: 'Sumatera Utara', lat: 2.0025, lon: 98.9667 },
  sibolga: { name: 'Sibolga', province: 'Sumatera Utara', lat: 1.7428, lon: 98.7792 },
  'padang sidempuan': { name: 'Padang Sidempuan', province: 'Sumatera Utara', lat: 1.3733, lon: 99.2731 },
  'sumatera utara': { name: 'Sumatera Utara', province: 'Sumatera Utara', lat: 3.5952, lon: 98.6722 },
  sumut: { name: 'Sumatera Utara', province: 'Sumatera Utara', lat: 3.5952, lon: 98.6722 },

  // DKI JAKARTA
  jakarta: { name: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lon: 106.8456 },
  'dki jakarta': { name: 'DKI Jakarta', province: 'DKI Jakarta', lat: -6.2088, lon: 106.8456 },
  'jakarta selatan': { name: 'Jakarta Selatan', province: 'DKI Jakarta', lat: -6.2615, lon: 106.8106 },
  'jakarta barat': { name: 'Jakarta Barat', province: 'DKI Jakarta', lat: -6.1683, lon: 106.7589 },
  'jakarta timur': { name: 'Jakarta Timur', province: 'DKI Jakarta', lat: -6.225, lon: 106.9004 },
  'jakarta pusat': { name: 'Jakarta Pusat', province: 'DKI Jakarta', lat: -6.1805, lon: 106.8284 },
  'jakarta utara': { name: 'Jakarta Utara', province: 'DKI Jakarta', lat: -6.1214, lon: 106.7741 },

  // JAWA BARAT
  bandung: { name: 'Bandung', province: 'Jawa Barat', lat: -6.9175, lon: 107.6191 },
  bogor: { name: 'Bogor', province: 'Jawa Barat', lat: -6.5971, lon: 106.806 },
  depok: { name: 'Depok', province: 'Jawa Barat', lat: -6.4025, lon: 106.7942 },
  bekasi: { name: 'Bekasi', province: 'Jawa Barat', lat: -6.2383, lon: 106.9756 },
  cirebon: { name: 'Cirebon', province: 'Jawa Barat', lat: -6.732, lon: 108.5523 },
  sukabumi: { name: 'Sukabumi', province: 'Jawa Barat', lat: -6.9277, lon: 106.93 },
  tasikmalaya: { name: 'Tasikmalaya', province: 'Jawa Barat', lat: -7.3274, lon: 108.2207 },
  karawang: { name: 'Karawang', province: 'Jawa Barat', lat: -6.305, lon: 107.299 },
  cimahi: { name: 'Cimahi', province: 'Jawa Barat', lat: -6.8723, lon: 107.542 },
  garut: { name: 'Garut', province: 'Jawa Barat', lat: -7.2278, lon: 107.9086 },
  purwakarta: { name: 'Purwakarta', province: 'Jawa Barat', lat: -6.5569, lon: 107.4433 },
  subang: { name: 'Subang', province: 'Jawa Barat', lat: -6.5716, lon: 107.7587 },
  cianjur: { name: 'Cianjur', province: 'Jawa Barat', lat: -6.8239, lon: 107.1394 },
  sumedang: { name: 'Sumedang', province: 'Jawa Barat', lat: -6.8586, lon: 107.9267 },
  indramayu: { name: 'Indramayu', province: 'Jawa Barat', lat: -6.3264, lon: 108.32 },
  kuningan: { name: 'Kuningan', province: 'Jawa Barat', lat: -6.9765, lon: 108.4831 },
  'jawa barat': { name: 'Jawa Barat', province: 'Jawa Barat', lat: -6.9175, lon: 107.6191 },
  jabar: { name: 'Jawa Barat', province: 'Jawa Barat', lat: -6.9175, lon: 107.6191 },

  // BANTEN
  tangerang: { name: 'Tangerang', province: 'Banten', lat: -6.1783, lon: 106.6319 },
  'tangerang selatan': { name: 'Tangerang Selatan', province: 'Banten', lat: -6.2888, lon: 106.7179 },
  tangsel: { name: 'Tangerang Selatan', province: 'Banten', lat: -6.2888, lon: 106.7179 },
  serang: { name: 'Serang', province: 'Banten', lat: -6.1104, lon: 106.164 },
  cilegon: { name: 'Cilegon', province: 'Banten', lat: -6.0023, lon: 106.012 },
  pandeglang: { name: 'Pandeglang', province: 'Banten', lat: -6.3086, lon: 106.1065 },
  lebak: { name: 'Lebak', province: 'Banten', lat: -6.3571, lon: 106.2483 },
  banten: { name: 'Banten', province: 'Banten', lat: -6.1104, lon: 106.164 },

  // JAWA TENGAH & DI YOGYAKARTA
  semarang: { name: 'Semarang', province: 'Jawa Tengah', lat: -6.9667, lon: 110.4167 },
  solo: { name: 'Surakarta / Solo', province: 'Jawa Tengah', lat: -7.5755, lon: 110.8243 },
  surakarta: { name: 'Surakarta / Solo', province: 'Jawa Tengah', lat: -7.5755, lon: 110.8243 },
  magelang: { name: 'Magelang', province: 'Jawa Tengah', lat: -7.4706, lon: 110.2178 },
  purwokerto: { name: 'Purwokerto', province: 'Jawa Tengah', lat: -7.4243, lon: 109.2301 },
  banyumas: { name: 'Banyumas', province: 'Jawa Tengah', lat: -7.5167, lon: 109.2833 },
  tegal: { name: 'Tegal', province: 'Jawa Tengah', lat: -6.8694, lon: 109.1402 },
  pekalongan: { name: 'Pekalongan', province: 'Jawa Tengah', lat: -6.8886, lon: 109.6753 },
  salatiga: { name: 'Salatiga', province: 'Jawa Tengah', lat: -7.3305, lon: 110.5084 },
  kudus: { name: 'Kudus', province: 'Jawa Tengah', lat: -6.8048, lon: 110.8405 },
  jepara: { name: 'Jepara', province: 'Jawa Tengah', lat: -6.5922, lon: 110.6778 },
  klaten: { name: 'Klaten', province: 'Jawa Tengah', lat: -7.7058, lon: 110.6067 },
  cilacap: { name: 'Cilacap', province: 'Jawa Tengah', lat: -7.7029, lon: 109.0159 },
  'jawa tengah': { name: 'Jawa Tengah', province: 'Jawa Tengah', lat: -6.9667, lon: 110.4167 },
  jateng: { name: 'Jawa Tengah', province: 'Jawa Tengah', lat: -6.9667, lon: 110.4167 },

  yogyakarta: { name: 'Yogyakarta', province: 'DI Yogyakarta', lat: -7.7956, lon: 110.3695 },
  jogja: { name: 'Yogyakarta', province: 'DI Yogyakarta', lat: -7.7956, lon: 110.3695 },
  sleman: { name: 'Sleman', province: 'DI Yogyakarta', lat: -7.7156, lon: 110.3556 },
  bantul: { name: 'Bantul', province: 'DI Yogyakarta', lat: -7.8897, lon: 110.3294 },
  'di yogyakarta': { name: 'DI Yogyakarta', province: 'DI Yogyakarta', lat: -7.7956, lon: 110.3695 },

  // JAWA TIMUR
  surabaya: { name: 'Surabaya', province: 'Jawa Timur', lat: -7.2575, lon: 112.7521 },
  malang: { name: 'Malang', province: 'Jawa Timur', lat: -7.9797, lon: 112.6304 },
  sidoarjo: { name: 'Sidoarjo', province: 'Jawa Timur', lat: -7.4478, lon: 112.7183 },
  gresik: { name: 'Gresik', province: 'Jawa Timur', lat: -7.1566, lon: 112.6555 },
  kediri: { name: 'Kediri', province: 'Jawa Timur', lat: -7.848, lon: 112.0178 },
  jember: { name: 'Jember', province: 'Jawa Timur', lat: -8.1724, lon: 113.6995 },
  banyuwangi: { name: 'Banyuwangi', province: 'Jawa Timur', lat: -8.2192, lon: 114.3692 },
  madiun: { name: 'Madiun', province: 'Jawa Timur', lat: -7.6298, lon: 111.5239 },
  mojokerto: { name: 'Mojokerto', province: 'Jawa Timur', lat: -7.4726, lon: 112.4385 },
  pasuruan: { name: 'Pasuruan', province: 'Jawa Timur', lat: -7.6453, lon: 112.9075 },
  probolinggo: { name: 'Probolinggo', province: 'Jawa Timur', lat: -7.7543, lon: 113.2159 },
  blitar: { name: 'Blitar', province: 'Jawa Timur', lat: -8.0983, lon: 112.1681 },
  batu: { name: 'Batu', province: 'Jawa Timur', lat: -7.8712, lon: 112.527 },
  bojonegoro: { name: 'Bojonegoro', province: 'Jawa Timur', lat: -7.1502, lon: 111.8818 },
  tuban: { name: 'Tuban', province: 'Jawa Timur', lat: -6.8976, lon: 112.0649 },
  'jawa timur': { name: 'Jawa Timur', province: 'Jawa Timur', lat: -7.2575, lon: 112.7521 },
  jatim: { name: 'Jawa Timur', province: 'Jawa Timur', lat: -7.2575, lon: 112.7521 },

  // SUMATERA BARAT, RIAU & LAINNYA
  padang: { name: 'Padang', province: 'Sumatera Barat', lat: -0.9471, lon: 100.4172 },
  bukittinggi: { name: 'Bukittinggi', province: 'Sumatera Barat', lat: -0.3056, lon: 100.3692 },
  payakumbuh: { name: 'Payakumbuh', province: 'Sumatera Barat', lat: -0.2228, lon: 100.6331 },
  'sumatera barat': { name: 'Sumatera Barat', province: 'Sumatera Barat', lat: -0.9471, lon: 100.4172 },
  sumbar: { name: 'Sumatera Barat', province: 'Sumatera Barat', lat: -0.9471, lon: 100.4172 },

  pekanbaru: { name: 'Pekanbaru', province: 'Riau', lat: 0.5071, lon: 101.4478 },
  dumai: { name: 'Dumai', province: 'Riau', lat: 1.6667, lon: 101.45 },
  riau: { name: 'Riau', province: 'Riau', lat: 0.5071, lon: 101.4478 },

  batam: { name: 'Batam', province: 'Kepulauan Riau', lat: 1.0456, lon: 104.0305 },
  'tanjung pinang': { name: 'Tanjung Pinang', province: 'Kepulauan Riau', lat: 0.9167, lon: 104.45 },
  'kepulauan riau': { name: 'Kepulauan Riau', province: 'Kepulauan Riau', lat: 1.0456, lon: 104.0305 },
  kepri: { name: 'Kepulauan Riau', province: 'Kepulauan Riau', lat: 1.0456, lon: 104.0305 },

  palembang: { name: 'Palembang', province: 'Sumatera Selatan', lat: -2.9761, lon: 104.7754 },
  'sumatera selatan': { name: 'Sumatera Selatan', province: 'Sumatera Selatan', lat: -2.9761, lon: 104.7754 },
  sumsel: { name: 'Sumatera Selatan', province: 'Sumatera Selatan', lat: -2.9761, lon: 104.7754 },

  'bandar lampung': { name: 'Bandar Lampung', province: 'Lampung', lat: -5.45, lon: 105.2667 },
  lampung: { name: 'Lampung', province: 'Lampung', lat: -5.45, lon: 105.2667 },

  jambi: { name: 'Jambi', province: 'Jambi', lat: -1.6101, lon: 103.6131 },
  bengkulu: { name: 'Bengkulu', province: 'Bengkulu', lat: -3.8004, lon: 102.2655 },
  'pangkal pinang': { name: 'Pangkal Pinang', province: 'Kepulauan Bangka Belitung', lat: -2.1316, lon: 106.1129 },
  'bangka belitung': { name: 'Bangka Belitung', province: 'Kepulauan Bangka Belitung', lat: -2.1316, lon: 106.1129 },

  'banda aceh': { name: 'Banda Aceh', province: 'Aceh', lat: 5.5483, lon: 95.3238 },
  aceh: { name: 'Aceh', province: 'Aceh', lat: 5.5483, lon: 95.3238 },
  lhokseumawe: { name: 'Lhokseumawe', province: 'Aceh', lat: 5.1801, lon: 97.1406 },

  // BALI & NUSA TENGGARA
  denpasar: { name: 'Denpasar', province: 'Bali', lat: -8.6705, lon: 115.2126 },
  bali: { name: 'Bali', province: 'Bali', lat: -8.6705, lon: 115.2126 },
  kuta: { name: 'Kuta', province: 'Bali', lat: -8.7233, lon: 115.1725 },
  ubud: { name: 'Ubud', province: 'Bali', lat: -8.5069, lon: 115.2625 },

  mataram: { name: 'Mataram', province: 'Nusa Tenggara Barat', lat: -8.5771, lon: 116.103 },
  lombok: { name: 'Lombok', province: 'Nusa Tenggara Barat', lat: -8.5771, lon: 116.103 },
  'nusa tenggara barat': { name: 'Nusa Tenggara Barat', province: 'Nusa Tenggara Barat', lat: -8.5771, lon: 116.103 },
  ntb: { name: 'Nusa Tenggara Barat', province: 'Nusa Tenggara Barat', lat: -8.5771, lon: 116.103 },

  kupang: { name: 'Kupang', province: 'Nusa Tenggara Timur', lat: -10.1772, lon: 123.607 },
  'labuan bajo': { name: 'Labuan Bajo', province: 'Nusa Tenggara Timur', lat: -8.4964, lon: 119.8877 },
  'nusa tenggara timur': { name: 'Nusa Tenggara Timur', province: 'Nusa Tenggara Timur', lat: -10.1772, lon: 123.607 },
  ntt: { name: 'Nusa Tenggara Timur', province: 'Nusa Tenggara Timur', lat: -10.1772, lon: 123.607 },

  // KALIMANTAN
  pontianak: { name: 'Pontianak', province: 'Kalimantan Barat', lat: -0.0263, lon: 109.3425 },
  'kalimantan barat': { name: 'Kalimantan Barat', province: 'Kalimantan Barat', lat: -0.0263, lon: 109.3425 },
  kalbar: { name: 'Kalimantan Barat', province: 'Kalimantan Barat', lat: -0.0263, lon: 109.3425 },

  banjarmasin: { name: 'Banjarmasin', province: 'Kalimantan Selatan', lat: -3.3194, lon: 114.5908 },
  banjarbaru: { name: 'Banjarbaru', province: 'Kalimantan Selatan', lat: -3.4402, lon: 114.8306 },
  'kalimantan selatan': { name: 'Kalimantan Selatan', province: 'Kalimantan Selatan', lat: -3.3194, lon: 114.5908 },
  kalsel: { name: 'Kalimantan Selatan', province: 'Kalimantan Selatan', lat: -3.3194, lon: 114.5908 },

  samarinda: { name: 'Samarinda', province: 'Kalimantan Timur', lat: -0.5022, lon: 117.1537 },
  balikpapan: { name: 'Balikpapan', province: 'Kalimantan Timur', lat: -1.2379, lon: 116.8289 },
  ikn: { name: 'Nusantara (IKN)', province: 'Kalimantan Timur', lat: -0.9744, lon: 116.7092 },
  'kalimantan timur': { name: 'Kalimantan Timur', province: 'Kalimantan Timur', lat: -0.5022, lon: 117.1537 },
  kaltim: { name: 'Kalimantan Timur', province: 'Kalimantan Timur', lat: -0.5022, lon: 117.1537 },

  palangkaraya: { name: 'Palangkaraya', province: 'Kalimantan Tengah', lat: -2.2161, lon: 113.9139 },
  sampit: { name: 'Sampit', province: 'Kalimantan Tengah', lat: -2.5333, lon: 112.95 },
  'kalimantan tengah': { name: 'Kalimantan Tengah', province: 'Kalimantan Tengah', lat: -2.2161, lon: 113.9139 },
  kalteng: { name: 'Kalimantan Tengah', province: 'Kalimantan Tengah', lat: -2.2161, lon: 113.9139 },

  tarakan: { name: 'Tarakan', province: 'Kalimantan Utara', lat: 3.3, lon: 117.6333 },
  'tanjung selor': { name: 'Tanjung Selor', province: 'Kalimantan Utara', lat: 2.8717, lon: 117.3828 },
  'kalimantan utara': { name: 'Kalimantan Utara', province: 'Kalimantan Utara', lat: 2.8717, lon: 117.3828 },
  kaltara: { name: 'Kalimantan Utara', province: 'Kalimantan Utara', lat: 2.8717, lon: 117.3828 },

  // SULAWESI
  makassar: { name: 'Makassar', province: 'Sulawesi Selatan', lat: -5.1477, lon: 119.4327 },
  gowa: { name: 'Gowa', province: 'Sulawesi Selatan', lat: -5.2833, lon: 119.5833 },
  maros: { name: 'Maros', province: 'Sulawesi Selatan', lat: -5.0028, lon: 119.5739 },
  parepare: { name: 'Parepare', province: 'Sulawesi Selatan', lat: -4.0131, lon: 119.6247 },
  palopo: { name: 'Palopo', province: 'Sulawesi Selatan', lat: -2.9944, lon: 120.1969 },
  bone: { name: 'Bone', province: 'Sulawesi Selatan', lat: -4.5386, lon: 120.3283 },
  'sulawesi selatan': { name: 'Sulawesi Selatan', province: 'Sulawesi Selatan', lat: -5.1477, lon: 119.4327 },
  sulsel: { name: 'Sulawesi Selatan', province: 'Sulawesi Selatan', lat: -5.1477, lon: 119.4327 },

  manado: { name: 'Manado', province: 'Sulawesi Utara', lat: 1.4748, lon: 124.8421 },
  bitung: { name: 'Bitung', province: 'Sulawesi Utara', lat: 1.4451, lon: 125.1824 },
  'sulawesi utara': { name: 'Sulawesi Utara', province: 'Sulawesi Utara', lat: 1.4748, lon: 124.8421 },
  sulut: { name: 'Sulawesi Utara', province: 'Sulawesi Utara', lat: 1.4748, lon: 124.8421 },

  palu: { name: 'Palu', province: 'Sulawesi Tengah', lat: -0.9003, lon: 119.878 },
  poso: { name: 'Poso', province: 'Sulawesi Tengah', lat: -1.3959, lon: 120.7525 },
  'sulawesi tengah': { name: 'Sulawesi Tengah', province: 'Sulawesi Tengah', lat: -0.9003, lon: 119.878 },
  sulteng: { name: 'Sulawesi Tengah', province: 'Sulawesi Tengah', lat: -0.9003, lon: 119.878 },

  kendari: { name: 'Kendari', province: 'Sulawesi Tenggara', lat: -3.9985, lon: 122.5126 },
  baubau: { name: 'Baubau', province: 'Sulawesi Tenggara', lat: -5.4667, lon: 122.6333 },
  'sulawesi tenggara': { name: 'Sulawesi Tenggara', province: 'Sulawesi Tenggara', lat: -3.9985, lon: 122.5126 },
  sultra: { name: 'Sulawesi Tenggara', province: 'Sulawesi Tenggara', lat: -3.9985, lon: 122.5126 },

  gorontalo: { name: 'Gorontalo', province: 'Gorontalo', lat: 0.5435, lon: 123.0568 },
  mamuju: { name: 'Mamuju', province: 'Sulawesi Barat', lat: -2.677, lon: 118.8894 },
  'sulawesi barat': { name: 'Sulawesi Barat', province: 'Sulawesi Barat', lat: -2.677, lon: 118.8894 },
  sulbar: { name: 'Sulawesi Barat', province: 'Sulawesi Barat', lat: -2.677, lon: 118.8894 },

  // MALUKU & PAPUA
  ambon: { name: 'Ambon', province: 'Maluku', lat: -3.6547, lon: 128.1906 },
  maluku: { name: 'Maluku', province: 'Maluku', lat: -3.6547, lon: 128.1906 },
  ternate: { name: 'Ternate', province: 'Maluku Utara', lat: 0.7893, lon: 127.361 },
  'maluku utara': { name: 'Maluku Utara', province: 'Maluku Utara', lat: 0.7893, lon: 127.361 },

  jayapura: { name: 'Jayapura', province: 'Papua', lat: -2.5916, lon: 140.669 },
  papua: { name: 'Papua', province: 'Papua', lat: -2.5916, lon: 140.669 },
  sorong: { name: 'Sorong', province: 'Papua Barat Daya', lat: -0.8762, lon: 131.2558 },
  manokwari: { name: 'Manokwari', province: 'Papua Barat', lat: -0.8615, lon: 134.062 },
  merauke: { name: 'Merauke', province: 'Papua Selatan', lat: -8.4991, lon: 140.4011 },
  timika: { name: 'Timika', province: 'Papua Tengah', lat: -4.5468, lon: 136.8837 },
  wamena: { name: 'Wamena', province: 'Papua Pegunungan', lat: -4.095, lon: 138.9442 },
};

// Fungsi pencarian lokasi cerdas (case-insensitive & pemetaan provinsi)
function resolveLocation(input) {
  if (!input) return null;
  const clean = input.toLowerCase().trim();

  // 1. Cek kecocokan persis pada kamus
  if (INDONESIA_LOCATIONS[clean]) {
    return INDONESIA_LOCATIONS[clean];
  }

  // 2. Cek apakah input mengandung kata kunci di kamus
  for (const [key, val] of Object.entries(INDONESIA_LOCATIONS)) {
    if (clean === key || clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }

  return null;
}

// Cari kota/kabupaten terdekat dari koordinat GPS
function findNearestLocation(lat, lon) {
  if (lat == null || lon == null) return null;
  let best = null;
  let bestD = Infinity;

  for (const [key, val] of Object.entries(INDONESIA_LOCATIONS)) {
    const d = haversine(lat, lon, val.lat, val.lon);
    if (d < bestD) {
      bestD = d;
      best = { ...val, dist: d };
    }
  }
  return best;
}

const COLS = [
  'username',
  'lang',
  'name',
  'age',
  'gender',
  'looking_for',
  'city',
  'province',
  'lat',
  'lon',
  'bio',
  'photos',
  'voice',
  'step',
  'status',
  'reject_reason',
];

const getUser = (id) => db.prepare('SELECT * FROM users WHERE tg_id=?').get(id);

function upsert(id, fields) {
  db.prepare('INSERT OR IGNORE INTO users(tg_id) VALUES(?)').run(id);
  for (const [k, v] of Object.entries(fields)) {
    if (!COLS.includes(k)) continue;
    db.prepare(`UPDATE users SET ${k}=?, updated_at=CURRENT_TIMESTAMP WHERE tg_id=?`).run(v, id);
  }
}

// Manajemen Admin
function addAdmin(id, username = '') {
  db.prepare('INSERT OR REPLACE INTO admins(tg_id, username) VALUES(?,?)').run(id, username || '');
}

function removeAdmin(id) {
  db.prepare('DELETE FROM admins WHERE tg_id=?').run(id);
}

function getAdminIds(envAdmins = '') {
  const fromEnv = (envAdmins || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const fromDb = db.prepare('SELECT tg_id FROM admins').all().map((r) => r.tg_id);
  return Array.from(new Set([...fromEnv, ...fromDb]));
}

function isAdmin(id, envAdmins = '') {
  const all = getAdminIds(envAdmins);
  if (all.length === 0) return true;
  return all.includes(Number(id));
}

// Manajemen Suka & Match
function addLike(from, to, message = '') {
  db.prepare('INSERT OR REPLACE INTO likes(from_id, to_id, message) VALUES(?,?,?)').run(from, to, message || '');
  db.prepare('INSERT OR IGNORE INTO seen(from_id, to_id) VALUES(?,?)').run(from, to);

  // Periksa apakah orang tersebut sudah like balik
  const mutual = db.prepare('SELECT message FROM likes WHERE from_id=? AND to_id=?').get(to, from);
  if (mutual) {
    const u1 = Math.min(from, to);
    const u2 = Math.max(from, to);
    db.prepare('INSERT OR IGNORE INTO matches(user1_id, user2_id) VALUES(?,?)').run(u1, u2);
    return { isMatch: true, partnerMessage: mutual.message || '' };
  }
  return { isMatch: false, partnerMessage: '' };
}

function addSkip(from, to) {
  db.prepare('INSERT OR IGNORE INTO seen(from_id, to_id) VALUES(?,?)').run(from, to);
}

// Reset yang sudah di-skip agar user bisa melihat kembali profil yang pernah dilewati
function resetSeen(from) {
  db.prepare('DELETE FROM seen WHERE from_id=? AND to_id NOT IN (SELECT to_id FROM likes WHERE from_id=?)').run(from, from);
}

// Cek orang yang sudah menyukai user ini tetapi belum direspon (incoming likes)
function getIncomingLikes(myId) {
  return db
    .prepare(
      `
    SELECT u.*, l.message as like_message, l.created_at as liked_at
    FROM likes l
    JOIN users u ON l.from_id = u.tg_id
    WHERE l.to_id = ?
      AND l.from_id NOT IN (SELECT to_id FROM seen WHERE from_id = ?)
      AND u.status != 'rejected'
      AND u.step = 'done'
    ORDER BY l.created_at DESC
  `
    )
    .all(myId, myId);
}

// Dapatkan daftar match (orang yang saling suka dengan user ini)
function getMatches(myId) {
  return db
    .prepare(
      `
    SELECT m.created_at as matched_at,
           u.tg_id, u.name, u.age, u.gender, u.city, u.province, u.lat, u.lon, u.username, u.photos, u.bio
    FROM matches m
    JOIN users u ON (CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END) = u.tg_id
    WHERE m.user1_id = ? OR m.user2_id = ?
    ORDER BY m.created_at DESC
  `
    )
    .all(myId, myId, myId);
}

// Cari kandidat selanjutnya:
// Mendukung:
// 1. Saling Suka (Incoming likes pertama kali)
// 2. Sama Kota (Case-insensitive) atau Terdekat secara Jarak GPS (km)
// 3. Sama Provinsi (misal: Nias & Medan sama-sama di Sumatera Utara)
// 4. Diurutkan dari yang terdekat
function nextCandidate(me, onlyNearby = false) {
  // Jika pencarian biasa (bukan khusus sekitar), cek incoming likes terlebih dahulu
  if (!onlyNearby) {
    const incoming = getIncomingLikes(me.tg_id);
    if (incoming.length > 0) {
      const cand = incoming[0];
      let dist = null;
      if (me.lat != null && me.lon != null && cand.lat != null && cand.lon != null) {
        dist = haversine(me.lat, me.lon, cand.lat, cand.lon);
      }
      const sameCity = (me.city || '').toLowerCase() === (cand.city || '').toLowerCase();
      const sameProvince = (me.province || '').toLowerCase() === (cand.province || '').toLowerCase();
      return { cand, dist, isIncomingLike: true, isNearby: false, sameCity, sameProvince };
    }
  }

  // Cari kandidat lawan jenis yang cocok
  const rows = db
    .prepare(
      `
    SELECT * FROM users
    WHERE tg_id != ?
      AND gender = ?
      AND looking_for = ?
      AND step = 'done'
      AND status != 'rejected'
      AND tg_id NOT IN (SELECT to_id FROM seen WHERE from_id = ?)
  `
    )
    .all(me.tg_id, me.looking_for, me.gender, me.tg_id);

  if (!rows.length) return {};

  const myCity = (me.city || '').toLowerCase().trim();
  const myProv = (me.province || '').toLowerCase().trim();
  const hasCoords = me.lat != null && me.lon != null;

  const scoredCandidates = [];

  for (const cand of rows) {
    const candCity = (cand.city || '').toLowerCase().trim();
    const candProv = (cand.province || '').toLowerCase().trim();

    const sameCity = Boolean(myCity && candCity && (myCity === candCity || myCity.includes(candCity) || candCity.includes(myCity)));
    const sameProv = Boolean(myProv && candProv && myProv === candProv);

    let dist = null;
    if (hasCoords && cand.lat != null && cand.lon != null) {
      dist = haversine(me.lat, me.lon, cand.lat, cand.lon);
    }

    // Skor kecocokan lokasi:
    // Semakin kecil skor, semakin diutamakan (prioritas):
    // - Kota sama / jarak sangat dekat (< 30km) -> skor = jarak (misal 5)
    // - Provinsi sama (misal Nias & Medan) -> skor = 500 + jarak (misal 500 + 200 = 700)
    // - Provinsi beda -> skor = 5000 + (jarak || 9999)
    let score = 999999;
    if (sameCity) {
      score = dist != null ? dist : 10;
    } else if (sameProv) {
      score = 500 + (dist != null ? dist : 50);
    } else if (dist != null) {
      score = 2000 + dist;
    } else {
      score = 10000;
    }

    scoredCandidates.push({
      cand,
      dist,
      sameCity,
      sameProvince: sameProv,
      score,
    });
  }

  // Urutkan berdasarkan skor prioritas lokasi terdekat
  scoredCandidates.sort((a, b) => a.score - b.score);

  const top = scoredCandidates[0];
  return {
    cand: top.cand,
    dist: top.dist,
    isIncomingLike: false,
    isNearby: onlyNearby,
    sameCity: top.sameCity,
    sameProvince: top.sameProvince,
  };
}

// Statistik sistem untuk admin
function getStats() {
  const total = db.prepare('SELECT count(*) as c FROM users').get().c;
  const male = db.prepare("SELECT count(*) as c FROM users WHERE gender='M'").get().c;
  const female = db.prepare("SELECT count(*) as c FROM users WHERE gender='F'").get().c;
  const pending = db.prepare("SELECT count(*) as c FROM users WHERE status='pending'").get().c;
  const verified = db.prepare("SELECT count(*) as c FROM users WHERE status='verified'").get().c;
  const matches = db.prepare('SELECT count(*) as c FROM matches').get().c;
  const likes = db.prepare('SELECT count(*) as c FROM likes').get().c;
  return { total, male, female, pending, verified, matches, likes };
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE tg_id=?').run(id);
  db.prepare('DELETE FROM likes WHERE from_id=? OR to_id=?').run(id, id);
  db.prepare('DELETE FROM seen WHERE from_id=? OR to_id=?').run(id, id);
  db.prepare('DELETE FROM matches WHERE user1_id=? OR user2_id=?').run(id, id);
}

module.exports = {
  db,
  getUser,
  upsert,
  addAdmin,
  removeAdmin,
  getAdminIds,
  isAdmin,
  addLike,
  addSkip,
  resetSeen,
  getIncomingLikes,
  getMatches,
  nextCandidate,
  getStats,
  deleteUser,
  resolveLocation,
  findNearestLocation,
  haversine,
  INDONESIA_LOCATIONS,
};
