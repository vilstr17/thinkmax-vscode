'use strict';
const START = new Set(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PreCompact', 'PostCompact', 'ElicitationResult']);
const END = new Set(['Stop', 'StopFailure', 'Interrupt', 'SessionEnd', 'process-exit']);
function reduce(previous, event, now = Date.now()) {
  const s = previous || { phase: 'connecting', session: '', turn: '', lastAt: 0, changedAt: now, closedTurn: '' };
  if (!event || !Number.isFinite(event.at) || event.at < s.lastAt || event.at > now + 5000 || event.agent) return s;
  if (s.terminated) return s;
  if (event.event === 'process-exit') return { ...s, phase: 'closed', terminated: true, lastAt: event.at, changedAt: now };
  if (s.phase === 'closed' && event.event !== 'SessionStart') return s;
  if (event.event !== 'SessionStart' && s.session && event.session !== s.session) return s;
  if (event.event === 'SessionStart') return { phase: 'idle', session: event.session, turn: '', lastAt: event.at, changedAt: now, closedTurn: '' };
  if (s.turn && event.turn && event.turn !== s.turn && event.event !== 'UserPromptSubmit') return s;
  const needsInput = event.event === 'PermissionRequest' || event.event === 'Elicitation' || (event.event === 'PreToolUse' && /AskUserQuestion|request_user_input/.test(event.tool || '')) || (event.event === 'Notification' && /permission_prompt|elicitation_dialog/.test(event.notification || ''));
  if (event.turn && event.turn === s.closedTurn && (START.has(event.event) || needsInput) && event.event !== 'UserPromptSubmit') return s;
  const completed = END.has(event.event) || (event.event === 'Notification' && event.notification === 'idle_prompt');
  let phase = s.phase;
  if (START.has(event.event)) phase = 'working';
  if (needsInput) phase = 'waiting';
  if (completed) phase = event.event === 'SessionEnd' ? 'closed' : 'idle';
  const turn = event.turn || s.turn;
  return { ...s, phase, session: event.session || s.session, turn, lastAt: event.at,
    changedAt: phase !== s.phase ? now : s.changedAt,
    closedTurn: completed ? turn : event.event === 'UserPromptSubmit' ? '' : s.closedTurn };
}
function shouldShow(state, { enabled, selected, focused, staleMs, now = Date.now() }) {
  return Boolean(enabled && selected && focused && ['working','active'].includes(state?.phase) && now - state.lastAt < staleMs);
}
module.exports = { reduce, shouldShow };
