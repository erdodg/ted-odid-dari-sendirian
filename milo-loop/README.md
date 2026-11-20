# Close the Loop: MILO Isi Ulang (3-minute pitch + live game)

MBA UGM Marketing Management, BPR pitch by Erdo Deshiant Garnaby (NIM 50755).

- `index.html`: the deck (3 slides, ~3 minutes: hook, live BPR game, closing) and the game host. Open on the projector.
- `FIP_Erdo_50755_KK_TNYI.pdf`: the full marketing-plan paper, downloadable from the closing slide (button and QR).
- `play.html`: the phone controller. Players reach it by scanning the QR on the deck.

## Presenter keys
→ / Space next · ← back · N speaker notes · T 3:00 timer · F full screen · S start round (slide 2) · R reset

## How the game works
Up to 15 players. Each gets a role in the circular supply chain: farmer, factory operator, distributor truck,
warung owner, family, pack collector, Waste Station crew. Move with the joystick, press AKSI at your station.
Score: glasses served, packs returned, packs refilled, revenue. Roles nobody plays run slowly on "auto".

Phones and the deck talk through a public MQTT broker over WebSocket (EMQX, HiveMQ or Mosquitto, first one
that answers), so it runs on GitHub Pages with no server. If the venue Wi-Fi blocks it, ask players to use
mobile data. `?net=local` runs everything inside one browser for testing.
