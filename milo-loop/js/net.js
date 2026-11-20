/* Tiny pub/sub layer shared by the host (deck) and the phones.
   Default: MQTT over WebSocket on a public broker, so it runs on GitHub Pages with no server.
   ?net=local uses BroadcastChannel (same browser, for testing). */
(function () {
  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt'
  ];
  const PREFIX = 'odid-milo-loop/v1/';

  function rid(n) {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  function localNet(room, role, onMsg, onStatus) {
    const bc = new BroadcastChannel(PREFIX + room);
    const mine = role === 'host' ? 'p' : 'h';
    bc.onmessage = (e) => { if (e.data && e.data.ch === mine) onMsg(e.data.m); };
    setTimeout(() => onStatus({ ok: true, broker: -1, label: 'local' }), 0);
    return {
      broker: -1,
      send(m) { bc.postMessage({ ch: role === 'host' ? 'h' : 'p', m }); },
      close() { bc.close(); }
    };
  }

  function tryBroker(i, room, role, onMsg, onStatus, fixed) {
    return new Promise((resolve) => {
      const url = BROKERS[i];
      let done = false;
      const client = window.mqtt.connect(url, {
        clientId: 'loop_' + role + '_' + rid(8),
        connectTimeout: 7000,
        reconnectPeriod: fixed ? 2000 : 0,
        clean: true,
        keepalive: 30
      });
      const subTopic = PREFIX + room + (role === 'host' ? '/p' : '/h');
      const pubTopic = PREFIX + room + (role === 'host' ? '/h' : '/p');
      const fail = () => {
        if (done) return;
        done = true;
        try { client.end(true); } catch (e) {}
        resolve(null);
      };
      const timer = setTimeout(fail, fixed ? 15000 : 7000);
      client.on('connect', () => {
        client.subscribe(subTopic, { qos: 0 });
        onStatus({ ok: true, broker: i, label: url.split('/')[2] });
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({
          broker: i,
          send(m) { if (client.connected) client.publish(pubTopic, JSON.stringify(m), { qos: 0 }); },
          close() { client.end(true); }
        });
      });
      client.on('message', (t, buf) => {
        try { onMsg(JSON.parse(buf.toString())); } catch (e) {}
      });
      client.on('offline', () => onStatus({ ok: false, broker: i, label: 'reconnecting' }));
      client.on('error', () => { if (!fixed) fail(); });
    });
  }

  /* role: 'host' | 'player'. broker: index the host picked (players), or undefined (host tries in order). */
  async function connect(opts) {
    const { room, role, onMsg, onStatus, net, broker } = opts;
    if (net === 'local' || !window.mqtt) return localNet(room, role, onMsg, onStatus);
    if (role === 'player' && broker >= 0) {
      const c = await tryBroker(broker, room, role, onMsg, onStatus, true);
      if (c) return c;
      onStatus({ ok: false, broker, label: 'cannot reach server' });
      return null;
    }
    for (let i = 0; i < BROKERS.length; i++) {
      const c = await tryBroker(i, room, role, onMsg, onStatus, false);
      if (c) {
        // host: keep a reconnecting client on the chosen broker
        c.close();
        return await tryBroker(i, room, role, onMsg, onStatus, true);
      }
    }
    onStatus({ ok: false, broker: -2, label: 'no broker reachable' });
    return null;
  }

  window.LoopNet = { connect, rid, BROKERS };
})();
