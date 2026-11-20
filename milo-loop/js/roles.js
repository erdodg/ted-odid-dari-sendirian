/* Shared definitions for host and phones */
window.LOOP_DEF = {
  roles: {
    sopir:    { icon: '🚚', name: 'Sopir Truk Distributor', en: 'Distributor truck', vehicle: true, carry: ['raw', 'milo', 'clean'], cap: 4,
      task: 'Angkut barang: Kebun → Pabrik, Pabrik → Warung. Pulangnya bawa kemasan bersih dari Waste Station ke Pabrik (backhaul).' },
    pabrik:   { icon: '🏭', name: 'Operator Pabrik', en: 'Factory operator', home: 'factory',
      task: 'Berdiri di Pabrik, tekan AKSI untuk mengisi MILO. Kemasan bersih dipakai dulu (isi ulang), baru bahan baku.' },
    kolektor: { icon: '🛵', name: 'Kolektor Kemasan', en: 'Pack collector', vehicle: true, carry: ['empty'], cap: 4,
      task: 'Ambil kemasan kosong di Rumah, antar ke Waste Station. Setiap kemasan = deposit Rp500 kembali ke konsumen.' },
    warung:   { icon: '🏪', name: 'Pemilik Warung', en: 'Warung owner', home: 'warung',
      task: 'Berdiri di Warung, tekan AKSI untuk menjual MILO ke keluarga. Harga Rp2.460 per gelas.' },
    petani:   { icon: '🌱', name: 'Petani Kakao & Susu', en: 'Cocoa & dairy farmer', home: 'farm',
      task: 'Berdiri di Kebun, tekan AKSI untuk panen bahan baku (regenerative agriculture).' },
    konsumen: { icon: '🧒', name: 'Keluarga Konsumen', en: 'Family', home: 'home',
      task: 'Berdiri di Rumah, tekan AKSI untuk minum MILO. Kemasan kosongnya jangan dibuang, kumpulkan!' },
    pencuci:  { icon: '♻️', name: 'Petugas Waste Station', en: 'Waste Station crew', home: 'waste',
      task: 'Berdiri di Waste Station, tekan AKSI untuk mencuci dan cek kemasan supaya bisa diisi ulang.' }
  },
  /* join order: the 15th player still lands on a meaningful role */
  order: ['sopir', 'pabrik', 'kolektor', 'warung', 'petani', 'konsumen', 'pencuci',
          'sopir', 'kolektor', 'pabrik', 'konsumen', 'warung', 'pencuci', 'petani', 'sopir'],
  stations: {
    farm:    { name: 'Kebun', icon: '🌱', x: 210, y: 440, out: 'raw',   to: 'factory', role: 'petani' },
    factory: { name: 'Pabrik', icon: '🏭', x: 560, y: 150, out: 'milo',  to: 'warung',  role: 'pabrik', accepts: ['raw', 'clean'] },
    warung:  { name: 'Warung', icon: '🏪', x: 1080, y: 150, role: 'warung', accepts: ['milo'] },
    home:    { name: 'Rumah', icon: '🏠', x: 1400, y: 450, out: 'empty', to: 'waste', role: 'konsumen' },
    waste:   { name: 'Waste Station', icon: '♻️', x: 800, y: 750, out: 'clean', to: 'factory', role: 'pencuci', accepts: ['empty'] }
  },
  items: {
    raw:   { name: 'bahan baku', color: '#9BC53D' },
    milo:  { name: 'MILO', color: '#2E8B57' },
    empty: { name: 'kemasan kosong', color: '#C9B79C' },
    clean: { name: 'kemasan bersih', color: '#4FC3F7' }
  },
  price: 2460,
  deposit: 500,
  colors: ['#FF7A45', '#36CFC9', '#F7C948', '#B37FEB', '#FF85C0', '#73D13D', '#40A9FF', '#FFA940',
           '#5CDBD3', '#FFD666', '#D3ADF7', '#95DE64', '#69C0FF', '#FF9C6E', '#FFADD2']
};
