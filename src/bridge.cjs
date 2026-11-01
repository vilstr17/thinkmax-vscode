'use strict';
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const EVENTS = new Set(['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','PermissionRequest','Stop','StopFailure','Interrupt','SessionEnd','Notification','PreCompact','PostCompact','Elicitation','ElicitationResult','process-exit']);
async function createBridge(onEvent) {
  const clients = new Map();
  const server = http.createServer((req, res) => {
    const id = req.url?.slice(1), client = clients.get(id);
    const candidate = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(client ? `Bearer ${client.token}` : '-');
    if (req.method !== 'POST' || !client || candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) { res.writeHead(403).end(); return; }
    let data = '', length = 0;
    req.setTimeout(1500, () => req.destroy());
    req.on('data', chunk => { length += chunk.length; if (length > 4096) req.destroy(); else data += chunk; });
    req.on('end', () => {
      try {
        const e = JSON.parse(data);
        if (!EVENTS.has(e.event) || !Number.isFinite(e.at) || typeof e.session !== 'string' || e.session.length > 128 || (e.turn && (typeof e.turn !== 'string' || e.turn.length > 128))) throw Error('Invalid event');
        // Only lifecycle metadata crosses the bridge. Prompts, outputs and tool arguments never do.
        onEvent(id, { event: e.event, at: e.at, session: e.session, turn: e.turn || '', agent: Boolean(e.agent), tool: typeof e.tool === 'string' ? e.tool.slice(0, 128) : '', notification: typeof e.notification === 'string' ? e.notification.slice(0, 64) : '' });
        res.writeHead(204).end();
      } catch { res.writeHead(400).end(); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  server.on('error', () => {});
  return { port: server.address().port, register: (id, token) => clients.set(id, { token }), remove: id => clients.delete(id), dispose: () => { clients.clear(); server.close(); server.closeAllConnections(); } };
}
module.exports = { createBridge, EVENTS };
