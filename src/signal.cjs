'use strict';
const http = require('node:http');
const { createHash } = require('node:crypto');
const digest = value => typeof value === 'string' && value ? createHash('sha256').update(value).digest('hex') : '';
function metadata(input, at = Date.now()) {
  return { event: input.hook_event_name, session: digest(input.session_id), turn: digest(input.turn_id),
    agent: Boolean(input.agent_id), at, tool: input.tool_name || '', notification: input.notification_type || '' };
}
function connection(env) {
  return { port: env.ASSISTANT_ACTIVITY_PORT || env.BRAIN_GYM_PORT, channel: env.ASSISTANT_ACTIVITY_CHANNEL || env.BRAIN_GYM_CHANNEL, token: env.ASSISTANT_ACTIVITY_TOKEN || env.BRAIN_GYM_TOKEN };
}
function send(event, env = process.env) {
  const {port,channel,token}=connection(env);
  return new Promise(resolve => {
    if (!/^\d{1,5}$/.test(port || '') || !/^[a-f0-9]{32}$/.test(channel || '') || !/^[a-f0-9]{64}$/.test(token || '')) return resolve();
    const body = JSON.stringify(event);
    const request = http.request({ hostname: '127.0.0.1', port: Number(port), path: `/${channel}`, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, response => { response.resume(); response.once('end', resolve); });
    request.on('error', resolve);
    request.setTimeout(450, () => { request.destroy(); resolve(); });
    request.end(body);
  });
}
async function main() {
  let env=process.env;
  const index=process.argv.indexOf('--watch');
  // A terminal can outlive an extension reload, so inherited bridge ports may be stale.
  if(index>=0)env=await require('./watch.cjs').watchRoute(process.argv[index+1],process.argv[index+2])||env;
  if(!connection(env).channel)return;
  let raw = '', size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 8 * 1024 * 1024) return; raw += chunk; }
  try { await send(metadata(JSON.parse(raw)),env); } catch { /* Observational hooks always exit successfully and silently. */ }
}
if (require.main === module) {
  const deadline = setTimeout(() => process.exit(0), 2400);
  main().catch(() => {}).finally(() => { clearTimeout(deadline); process.exit(0); });
}
module.exports = { metadata, send };
