/* Nitro Apex — Cloudflare Worker: static assets + multiplayer room routing.
   WebSocket rooms run in a Durable Object (one per room code). */
import { RoomDO } from './src/room-do.js';

export { RoomDO };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || 'LOBBY').toUpperCase().slice(0, 8);
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(request);
    }
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, now: Date.now() }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    // static game files (assets binding serves ./public)
    return env.ASSETS.fetch(request);
  },
};
