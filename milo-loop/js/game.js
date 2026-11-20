/* Host side of "Close the Loop": runs the simulation, draws the shared map, talks to the phones. */
(function () {
  const D = window.LOOP_DEF;
  const W = 1600, H = 900;
  const ST = D.stations;
  const ROUTE = ['farm', 'factory', 'warung', 'home', 'waste'];

  function fmtRp(n) { return 'Rp' + Math.round(n).toLocaleString('en-US'); }

  function freshWorld() {
    return {
      inv: { farm: { raw: 6 }, factory: { raw: 2, clean: 0, milo: 2 }, warung: { milo: 2 }, home: { milo: 0, empty: 0 }, waste: { empty: 0, clean: 0 } },
      sc: { sold: 0, revenue: 0, served: 0, returned: 0, reused: 0, newPacks: 0, washed: 0 }
    };
  }

  function create(opts) {
    const canvas = opts.canvas;
    const ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;

    const params = new URLSearchParams(location.search);
    const netMode = params.get('net') || '';
    const room = params.get('room') || window.LoopNet.rid(4);

    let world = freshWorld();
    const players = new Map();
    let phase = 'lobby', duration = opts.duration || 45, endAt = 0, timeLeft = duration;
    let fx = [];
    let net = null, joinUrl = '';
    let botClock = { st: {}, tr: 0 };
    let tick = 0;

    /* ---------- networking ---------- */
    function onMsg(m) {
      if (!m || !m.id) return;
      let p = players.get(m.id);
      if (m.t === 'join') {
        if (!p) {
          if (players.size >= 15) { net.send({ t: 'full', id: m.id }); return; }
          const used = {};
          players.forEach(q => { used[q.role] = (used[q.role] || 0) + 1; });
          // next role in the order that keeps the team balanced
          let role = D.order[players.size % D.order.length];
          const counts = D.order.slice(0, players.size + 1).reduce((a, r) => { a[r] = (a[r] || 0) + 1; return a; }, {});
          for (const r of D.order) { if ((used[r] || 0) < (counts[r] || 0)) { role = r; break; } }
          const ci = [...Array(15).keys()].find(i => ![...players.values()].some(q => q.ci === i));
          const spawn = spawnFor(role);
          p = { id: m.id, name: String(m.name || 'Pemain').slice(0, 14), role, ci: ci ?? 0, x: spawn.x, y: spawn.y, ix: 0, iy: 0,
                carry: {}, last: 0, seen: performance.now(), acts: 0 };
          players.set(m.id, p);
          addFx(p.x, p.y - 50, p.name + ' bergabung', '#FFFFFF');
          opts.onPlayers && opts.onPlayers(list());
        }
        p.seen = performance.now();
        net.send({ t: 'as', id: p.id, role: p.role, ci: p.ci, name: p.name, room });
        return;
      }
      if (!p) { if (m.t !== 'leave') net && net.send({ t: 'who', id: m.id }); return; }
      p.seen = performance.now();
      if (m.t === 'in') { p.ix = clamp(+m.x || 0, -1, 1); p.iy = clamp(+m.y || 0, -1, 1); }
      else if (m.t === 'act') act(p);
      else if (m.t === 'leave') { players.delete(p.id); opts.onPlayers && opts.onPlayers(list()); }
    }

    function spawnFor(role) {
      const r = D.roles[role];
      const s = ST[r.home || (role === 'sopir' ? 'farm' : 'home')];
      return { x: s.x + (Math.random() * 120 - 60), y: s.y + 95 + Math.random() * 30 };
    }

    async function connectNet() {
      net = await window.LoopNet.connect({
        room, role: 'host', net: netMode, onMsg,
        onStatus: (s) => opts.onStatus && opts.onStatus(s)
      });
      if (!net) return;
      const u = new URL('play.html', location.href);
      u.search = '';
      u.searchParams.set('r', room);
      u.searchParams.set('b', String(net.broker));
      if (netMode) u.searchParams.set('net', netMode);
      joinUrl = u.toString();
      opts.onReady && opts.onReady({ room, url: joinUrl });
    }

    /* ---------- simulation ---------- */
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function load(p) { return Object.values(p.carry).reduce((a, b) => a + b, 0); }
    function addFx(x, y, text, color) { fx.push({ x, y, text, color: color || '#FFF', t: 0 }); if (fx.length > 40) fx.shift(); }
    function nearest(p) {
      let best = null, bd = 1e9;
      for (const k of ROUTE) { const d = dist(p, ST[k]); if (d < bd) { bd = d; best = k; } }
      return bd < 130 ? best : null;
    }

    function process(role, x, y, who) {
      const I = world.inv, S = world.sc;
      switch (role) {
        case 'petani':
          if (I.farm.raw >= 16) return 'Gudang kebun penuh';
          I.farm.raw++; addFx(x, y, '+ bahan baku', '#9BC53D'); return null;
        case 'pabrik':
          if (I.factory.clean > 0) { I.factory.clean--; I.factory.milo++; S.reused++; addFx(x, y, 'Isi ulang ♻️', '#4FC3F7'); return null; }
          if (I.factory.raw > 0) { I.factory.raw--; I.factory.milo++; S.newPacks++; addFx(x, y, '+ MILO', '#2E8B57'); return null; }
          return 'Butuh bahan atau kemasan bersih';
        case 'warung':
          if (I.warung.milo <= 0) return 'Stok warung habis';
          I.warung.milo--; I.home.milo++; S.sold++; S.revenue += D.price; addFx(x, y, '+' + fmtRp(D.price), '#F7C948'); return null;
        case 'konsumen':
          if (I.home.milo <= 0) return 'Belum ada MILO di rumah';
          I.home.milo--; I.home.empty++; S.served++; addFx(x, y, 'Energi! +1 gelas', '#FF85C0'); return null;
        case 'pencuci':
          if (I.waste.empty <= 0) return 'Belum ada kemasan kosong';
          I.waste.empty--; I.waste.clean++; S.washed++; addFx(x, y, 'Bersih ✓', '#4FC3F7'); return null;
      }
      return null;
    }

    function act(p) {
      const now = performance.now();
      if (now - p.last < 300) return;
      p.last = now; p.acts++; p.msgT = now;
      const R = D.roles[p.role];
      if (!R.vehicle) {
        const s = ST[R.home];
        if (dist(p, s) > 130) { p.msg = 'Ke ' + s.name + ' dulu'; return; }
        p.msg = process(p.role, p.x, p.y - 40, p) || '';
        return;
      }
      const k = nearest(p);
      if (!k) { p.msg = 'Dekati sebuah stasiun'; return; }
      const s = ST[k], inv = world.inv[k];
      let moved = 0, picked = 0;
      // drop what this station accepts
      for (const it of Object.keys(p.carry)) {
        if (p.carry[it] > 0 && s.accepts && s.accepts.includes(it)) {
          inv[it] = (inv[it] || 0) + p.carry[it];
          if (it === 'empty') { world.sc.returned += p.carry[it]; addFx(s.x, s.y - 70, '+' + p.carry[it] + ' kembali · deposit ' + fmtRp(D.deposit * p.carry[it]), '#C9B79C'); }
          moved += p.carry[it]; p.carry[it] = 0;
        }
      }
      // pick up this station's output, if this vehicle carries it
      if (s.out && R.carry.includes(s.out) && inv[s.out] > 0) {
        const n = Math.min(R.cap - load(p), inv[s.out]);
        if (n > 0) { inv[s.out] -= n; p.carry[s.out] = (p.carry[s.out] || 0) + n; picked = n; }
      }
      if (moved) addFx(p.x, p.y - 40, 'Antar ' + moved, '#FFFFFF');
      if (picked) addFx(p.x, p.y - 60, 'Muat ' + picked + ' ' + D.items[s.out].name, D.items[s.out].color);
      p.msg = (!moved && !picked) ? 'Tidak ada yang bisa dimuat di ' + s.name : '';
    }

    function humans(role) { for (const p of players.values()) if (p.role === role) return true; return false; }

    function bots(dt) {
      // stations whose role has no player run slowly on their own, so a small room still works
      for (const k of ROUTE) {
        const role = ST[k].role;
        if (humans(role)) { botClock.st[k] = 0; continue; }
        botClock.st[k] = (botClock.st[k] || 0) + dt;
        if (botClock.st[k] > 2.4) { botClock.st[k] = 0; process(role, ST[k].x, ST[k].y - 70); }
      }
      botClock.tr += dt;
      if (botClock.tr > 2.8) {
        botClock.tr = 0;
        const I = world.inv;
        if (!humans('sopir')) {
          if (I.farm.raw > 0) { I.farm.raw--; I.factory.raw++; }
          if (I.factory.milo > 0) { I.factory.milo--; I.warung.milo++; }
          if (I.waste.clean > 0) { I.waste.clean--; I.factory.clean++; }
        }
        if (!humans('kolektor') && I.home.empty > 0) { I.home.empty--; I.waste.empty++; world.sc.returned++; }
      }
    }

    function step(dt) {
      for (const p of players.values()) {
        const sp = D.roles[p.role].vehicle ? 420 : 330;
        p.x = clamp(p.x + p.ix * sp * dt, 30, W - 30);
        p.y = clamp(p.y + p.iy * sp * dt, 40, H - 30);
        if (performance.now() - p.seen > 30000) { players.delete(p.id); opts.onPlayers && opts.onPlayers(list()); }
      }
      bots(dt);
      fx.forEach(f => f.t += dt); fx = fx.filter(f => f.t < 1.3);
      if (phase === 'run') {
        timeLeft = Math.max(0, (endAt - performance.now()) / 1000);
        if (timeLeft <= 0) { phase = 'end'; opts.onEnd && opts.onEnd(score()); }
      }
    }

    function hint(p) {
      const R = D.roles[p.role];
      if (p.msg && performance.now() - (p.msgT || 0) < 2200) return p.msg;
      if (!R.vehicle) {
        const s = ST[R.home];
        return dist(p, s) > 130 ? 'Jalan ke ' + s.name + ' ' + s.icon : 'Kamu di ' + s.name + '. Tekan AKSI!';
      }
      const it = Object.keys(p.carry).find(k => p.carry[k] > 0);
      if (it) {
        const dest = ROUTE.find(k => ST[k].accepts && ST[k].accepts.includes(it));
        return 'Bawa ' + p.carry[it] + ' ' + D.items[it].name + ' → ' + ST[dest].name + ' ' + ST[dest].icon;
      }
      if (p.role === 'kolektor') return 'Ambil kemasan kosong di Rumah 🏠';
      const I = world.inv;
      if (I.waste.clean > 0) return 'Ada kemasan bersih di Waste Station ♻️ (backhaul)';
      if (I.factory.milo > 0) return 'Ambil MILO di Pabrik 🏭';
      return 'Ambil bahan baku di Kebun 🌱';
    }

    function score() {
      const s = world.sc;
      return Object.assign({}, s, {
        returnRate: s.sold ? Math.min(100, Math.round(100 * s.returned / s.sold)) : 0,
        players: players.size, phase, timeLeft
      });
    }

    function broadcast() {
      if (!net) return;
      const p = {};
      for (const q of players.values()) {
        const c = Object.keys(q.carry).filter(k => q.carry[k] > 0).map(k => q.carry[k] + ' ' + D.items[k].name).join(', ');
        p[q.id] = [q.role, q.ci, c, hint(q)];
      }
      const s = world.sc;
      net.send({ t: 'st', ph: phase, tl: Math.ceil(timeLeft), sc: [s.served, s.returned, s.reused, s.revenue], p });
    }

    /* ---------- drawing ---------- */
    function road() {
      const pts = ROUTE.map(k => ST[k]);
      ctx.beginPath();
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        if (i === 0) ctx.moveTo(p1.x, p1.y);
        ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
      }
      ctx.closePath();
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      // ground
      ctx.fillStyle = '#123524'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 18; i++) ctx.fillRect((i * 97) % W, 0, 1, H);
      // road and flow arrows
      road(); ctx.strokeStyle = '#2B4A3A'; ctx.lineWidth = 64; ctx.lineJoin = 'round'; ctx.stroke();
      road(); ctx.strokeStyle = '#3C6650'; ctx.lineWidth = 56; ctx.stroke();
      road(); ctx.setLineDash([22, 26]); ctx.lineDashOffset = -t * 0.06; ctx.strokeStyle = '#F7C948'; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
      // center label
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(250,246,240,0.10)'; ctx.font = '800 120px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('CLOSE THE LOOP', W / 2, H / 2 - 10);
      ctx.fillStyle = 'rgba(250,246,240,0.55)'; ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('MILO Isi Ulang · rantai pasok sirkular', W / 2, H / 2 + 70);

      // stations
      for (const k of ROUTE) {
        const s = ST[k], inv = world.inv[k];
        const human = humans(s.role);
        const near = [...players.values()].some(p => p.role === s.role && dist(p, s) < 130);
        ctx.save();
        ctx.translate(s.x, s.y);
        if (near) { ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.beginPath(); ctx.arc(0, 0, 128, 0, 7); ctx.fill(); }
        rr(-100, -66, 200, 132, 22); ctx.fillStyle = '#FAF6F0'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = near ? '#F7C948' : '#E2D8CA'; ctx.stroke();
        ctx.font = '48px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillText(s.icon, -54, -18);
        ctx.fillStyle = '#123524'; ctx.font = '800 24px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(s.name.length > 10 ? 'Waste' : s.name, -20, -30);
        if (s.name.length > 10) ctx.fillText('Station', -20, -4);
        ctx.textAlign = 'center';
        // inventory chips
        const keys = Object.keys(inv);
        keys.forEach((it, i) => {
          const cx = -80 + i * 60, cy = 38;
          ctx.fillStyle = D.items[it].color; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fill();
          ctx.fillStyle = '#123524'; ctx.font = '800 24px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'left';
          ctx.fillText(String(inv[it]), cx + 18, cy + 1); ctx.textAlign = 'center';
        });
        if (!human) { ctx.fillStyle = '#C4500F'; rr(52, -86, 70, 30, 15); ctx.fill(); ctx.fillStyle = '#FFF'; ctx.font = '700 17px "Plus Jakarta Sans", sans-serif'; ctx.fillText('auto', 87, -70); }
        ctx.restore();
      }

      // players
      for (const p of players.values()) {
        const R = D.roles[p.role], col = D.colors[p.ci % D.colors.length];
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 26, 26, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 28, 0, 7); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#FAF6F0'; ctx.stroke();
        ctx.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(R.icon, 0, 2);
        ctx.font = '800 20px "Plus Jakarta Sans", sans-serif'; ctx.fillStyle = '#FAF6F0';
        ctx.fillText(p.name, 0, 50);
        let i = 0;
        for (const it of Object.keys(p.carry)) for (let j = 0; j < p.carry[it]; j++, i++) {
          ctx.fillStyle = D.items[it].color; rr(-34 + i * 18, -52, 14, 14, 3); ctx.fill();
        }
        ctx.restore();
      }

      // floating effects
      for (const f of fx) {
        ctx.globalAlpha = Math.max(0, 1 - f.t / 1.3);
        ctx.fillStyle = f.color; ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(f.text, f.x, f.y - f.t * 60);
        ctx.globalAlpha = 1;
      }
    }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

    let lastT = performance.now();
    function frame(t) {
      const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
      step(dt);
      if (!document.hidden) draw(t);
      tick++;
      if (tick % 15 === 0) { broadcast(); opts.onScore && opts.onScore(score()); }
      requestAnimationFrame(frame);
    }

    function list() { return [...players.values()].map(p => ({ name: p.name, role: p.role, ci: p.ci })); }

    connectNet();
    requestAnimationFrame(frame);

    return {
      room,
      get url() { return joinUrl; },
      startRound(sec) {
        duration = sec || duration;
        world = freshWorld();
        botClock = { st: {}, tr: 0 };
        for (const p of players.values()) { const s = spawnFor(p.role); p.x = s.x; p.y = s.y; p.carry = {}; p.msg = ''; }
        phase = 'run'; endAt = performance.now() + duration * 1000; timeLeft = duration;
        broadcast();
      },
      reset() { world = freshWorld(); phase = 'lobby'; timeLeft = duration; broadcast(); },
      score, list,
      debug() { return [...players.values()].map(p => ({ id: p.id, name: p.name, role: p.role, x: p.x, y: p.y, carry: Object.assign({}, p.carry) })).concat([{ inv: world.inv }]); },
      get phase() { return phase; }
    };
  }

  window.LoopHost = { create, fmtRp };
})();
