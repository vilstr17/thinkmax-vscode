'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const MARKER = '--activity-bridge-v1';
const LEGACY_MARKER = '--brain-gym-hook-v1';
const COMMON = ['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','SessionEnd','PreCompact'];
const EVENTS = { codex: [...COMMON,'Interrupt','PostCompact'], claude: [...COMMON,'PostToolUseFailure','StopFailure','Notification','Elicitation','ElicitationResult'] };
const quote = s => `'${s.replace(/'/g, `'"'"'`)}'`;
function command(runtime, script, windows = false, cmdShell = false, watch = null) {
  if (watch) {
    const args = [runtime, script, watch.directory, watch.provider];
    if (cmdShell) {
      if (args.some(s => /["%\r\n]/.test(s))) throw Error('Unsupported Windows hook path.');
      return `if exist "${watch.directory}" if exist "${script}" (set ELECTRON_RUN_AS_NODE=1&& "${runtime}" "${script}" ${MARKER} --watch "${watch.directory}" ${watch.provider})`;
    }
    const normalized = args.map(s => windows ? s.replace(/\\/g, '/') : s);
    return `if [ -d ${quote(normalized[2])} ] && [ -f ${quote(normalized[1])} ]; then ELECTRON_RUN_AS_NODE=1 ${quote(normalized[0])} ${quote(normalized[1])} ${MARKER} --watch ${quote(normalized[2])} ${watch.provider}; fi`;
  }
  if (cmdShell) {
    if (/["%\r\n]/.test(runtime + script)) throw Error('Use a runtime and extension path without quotes or percent signs on Windows.');
    return `if defined ASSISTANT_ACTIVITY_CHANNEL (set ELECTRON_RUN_AS_NODE=1&& "${runtime}" "${script}" ${MARKER})`;
  }
  const normalize = s => windows ? s.replace(/\\/g, '/') : s;
  return `if [ -n "$ASSISTANT_ACTIVITY_CHANNEL" ]; then ELECTRON_RUN_AS_NODE=1 ${quote(normalize(runtime))} ${quote(normalize(script))} ${MARKER}; fi`;
}
function mergeHooks(config, provider, runtime, script, windows = false, remove = false, watch = null) {
  const result = structuredClone(config);
  if (result.hooks !== undefined && (!result.hooks || typeof result.hooks !== 'object' || Array.isArray(result.hooks))) throw Error('The existing hooks setting is not an object. thinkmaxx left it unchanged.');
  result.hooks ||= {};
  for (const [event, groups] of Object.entries(result.hooks)) {
    if (!Array.isArray(groups)) throw Error(`The existing ${event} hooks are not an array. thinkmaxx left them unchanged.`);
    result.hooks[event] = groups.map(group => {
      if (!group || !Array.isArray(group.hooks)) throw Error(`The existing ${event} hook group is invalid.`);
      return { ...group, hooks: group.hooks.filter(hook => ![MARKER,LEGACY_MARKER].some(marker=>hook.command?.includes(marker)||hook.commandWindows?.includes(marker))) };
    }).filter(group => group.hooks.length);
    if (!result.hooks[event].length) delete result.hooks[event];
  }
  if (!remove) for (const event of EVENTS[provider]) {
    const handler = { type: 'command', command: command(runtime, script, windows, false, watch), timeout: 3 };
    if (provider === 'codex' && windows) handler.commandWindows = command(runtime, script, true, true, watch);
    if(provider==='claude'&&windows){
      const ps=s=>`'${s.replace(/'/g,"''")}'`;
      handler.shell='powershell';
      handler.command=watch?`if ((Test-Path -LiteralPath ${ps(watch.directory)}) -and (Test-Path -LiteralPath ${ps(script)})) { $env:ELECTRON_RUN_AS_NODE='1'; & ${ps(runtime)} ${ps(script)} ${MARKER} --watch ${ps(watch.directory)} claude }`:`if ($env:ASSISTANT_ACTIVITY_CHANNEL) { $env:ELECTRON_RUN_AS_NODE='1'; & ${ps(runtime)} ${ps(script)} ${MARKER} }`;
    }
    const group = { hooks: [handler] };
    if (provider === 'claude' && event === 'Notification') group.matcher = 'permission_prompt|idle_prompt|elicitation_dialog|agent_needs_input|agent_completed';
    result.hooks[event] ||= []; result.hooks[event].push(group);
  }
  if (!Object.keys(result.hooks).length) delete result.hooks;
  return result;
}
function hookPath(root, provider) { return path.join(root, provider === 'codex' ? '.codex' : '.claude', provider === 'codex' ? 'hooks.json' : 'settings.local.json'); }
async function installHooks(root, provider, runtime, script, windows = process.platform === 'win32', remove = false, watch = null) {
  const file = watch?.file || hookPath(root, provider);
  let original = null;
  try { original = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (remove && original === null) return;
  let parsed; try { parsed = original === null ? {} : JSON.parse(original); } catch { throw Error(`Cannot read ${file}: invalid JSON. It was left unchanged.`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(`Cannot update ${file}: expected a JSON object.`);
  const merged = mergeHooks(parsed, provider, runtime, script, windows, remove, watch);
  if (JSON.stringify(parsed) === JSON.stringify(merged)) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (original !== null) await fs.writeFile(`${file}.brain-gym-backup-${Date.now()}`, original, { flag: 'wx', mode: 0o600 });
  // Recheck before replacing: do not overwrite a concurrent edit.
  let current = null; try { current = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (current !== original) throw Error('Hook settings changed during setup. Try again.');
  const temp = `${file}.brain-gym-${process.pid}.tmp`;
  try { await fs.writeFile(temp, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 }); await fs.rename(temp, file); }
  finally { await fs.unlink(temp).catch(() => {}); }
}
module.exports = { mergeHooks, installHooks, command, hookPath, EVENTS };
