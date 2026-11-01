'use strict';
const { spawn } = require('node:child_process');
const { send } = require('./signal.cjs');
async function main() {
  const [executable, ...args] = process.argv.slice(2);
  if (!executable) throw Error('No assistant executable configured.');
  let child;
  if (process.platform === 'win32' && /\.cmd$|\.bat$/i.test(executable)) {
    // cmd shims are required for npm-installed CLIs; shell metacharacters are rejected.
    if ([executable, ...args].some(s => /["&|<>^%\r\n]/.test(s))) throw Error('Unsupported characters in the Windows CLI path. Use the native executable.');
    child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[executable, ...args].map(s => `"${s}"`).join(' ')}"`], { stdio: 'inherit', env: process.env });
  } else child = spawn(executable, args, { stdio: 'inherit', env: process.env });
  const finish = async code => { await send({ event: 'process-exit', session: '', at: Date.now() }); process.exit(code); };
  child.once('error', async e => { console.error(`thinkmaxx could not start the assistant: ${e.message}\nCheck thinkmaxx Settings and make sure the CLI is installed and signed in.`); await finish(1); });
  child.once('exit', code => finish(code ?? 0));
  // The child receives terminal signals too; keep the wrapper alive to report its exit.
  process.on('SIGINT', () => {});
  process.on('SIGTERM', () => { child.kill('SIGTERM'); });
}
if (require.main === module) main().catch(async e => { console.error(e.message); await send({ event: 'process-exit', session: '', at: Date.now() }); process.exit(1); });
