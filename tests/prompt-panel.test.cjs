'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

test('submitting a prompt focuses the puzzle before closing the terminal panel', async () => {
  const commands = new Map(), calls = [];
  let onEvent, terminal, focused = 'terminal', panelVisible = true;
  const noop = () => ({ dispose() {} });
  const view = {
    webview: { asWebviewUri: () => 'resource', cspSource: 'resource', postMessage() {}, onDidReceiveMessage: noop },
    onDidDispose: noop,
    reveal(_column, preserveFocus) { calls.push('reveal'); if (!preserveFocus) focused = 'puzzle'; },
    dispose() {}
  };
  const vscode = {
    StatusBarAlignment: { Right: 1 }, ViewColumn: { Active: -1 }, ConfigurationTarget: { Global: 1 },
    Uri: { joinPath: (...parts) => parts.join('/') }, ThemeColor: class {},
    window: {
      state: { focused: true }, terminals: [], activeTerminal: null,
      createStatusBarItem: () => ({ show() {}, dispose() {} }), createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      createWebviewPanel: () => view, registerWebviewPanelSerializer: noop,
      createTerminal: () => { terminal = { name: 'Claude', processId: Promise.resolve(123), show() { focused = 'terminal'; panelVisible = true; } }; vscode.window.terminals.push(terminal); vscode.window.activeTerminal = terminal; return terminal; },
      showInformationMessage: async () => undefined, showErrorMessage: error => { throw Error(error); },
      onDidChangeActiveTerminal: noop, onDidOpenTerminal: noop, onDidChangeWindowState: noop, onDidCloseTerminal: noop
    },
    workspace: { isTrusted: true, workspaceFolders: [{ uri: { scheme: 'file', fsPath: '/tmp' } }], onDidChangeConfiguration: noop, onDidChangeWorkspaceFolders: noop, onDidGrantWorkspaceTrust: noop },
    commands: {
      registerCommand(name, fn) { commands.set(name, fn); return noop(); },
      async executeCommand(name) {
        if (name === 'workbench.action.closePanel') {
          calls.push('closePanel'); panelVisible = false;
          // A focused terminal can be restored by the workbench after closing it.
          if (focused === 'terminal') queueMicrotask(() => { panelVisible = true; });
        }
      }
    }
  };
  const originalLoad = Module._load;
  const target = path.resolve(__dirname, '../src/extension.cjs');
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === target) {
      if (request === 'vscode') return vscode;
      if (request === './bridge.cjs') return { createBridge: async cb => { onEvent = cb; return { port: 1234, register() {}, remove() {}, dispose() {} }; } };
      if (request === './hooks.cjs') return { installHooks: async () => {} };
      if (request === './detection.cjs') return { processSnapshot: async () => [], findAssistant: () => null, claudeActivity: async () => null, processCwd: async () => null };
      if (request === './settings.cjs') return { configuration: () => ({ get: (key, fallback) => key === 'claudePath' ? process.execPath : fallback }) };
    }
    return originalLoad.apply(this, arguments);
  };
  let extension;
  try { delete require.cache[target]; extension = require(target); } finally { Module._load = originalLoad; }
  const subscriptions = [];
  const context = { extensionPath: path.resolve(__dirname, '..'), extensionUri: 'extension', globalStorageUri: { fsPath: '/tmp/thinkmaxx-panel-test' }, subscriptions,
    globalState: { get: (_key, fallback) => fallback, update: async () => {} }, workspaceState: { get: (_key, fallback) => fallback, update: async () => {} } };
  const api = extension.activate(context);
  try {
    await commands.get('thinkmaxx.startClaude')();
    // The registered bridge identifies the managed terminal's channel.
    const channel = api.getActivity().conversations[0].id;
    calls.length = 0;
    onEvent(channel, { event: 'UserPromptSubmit', session: 'session', turn: 'turn', at: Date.now() });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['reveal', 'closePanel']);
    assert.equal(focused, 'puzzle');
    assert.equal(panelVisible, false);
    assert.equal(api.getActivity().conversations[0].phase, 'working');
    api.openChat(channel);
    assert.equal(panelVisible, true, 'the user can reopen the terminal');
  } finally { for (const subscription of subscriptions) subscription.dispose?.(); }
});
