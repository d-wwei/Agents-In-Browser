import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const scriptPath = join(__dirname, '..', 'dist', 'mainWorld.js');

function createWindow({ timeoutImmediately = false } = {}) {
  const listeners = new Set();
  let lastMessage = null;

  const win = {
    AGENTS_IN_BROWSER: undefined,
    addEventListener: (type, cb) => {
      if (type === 'message') listeners.add(cb);
    },
    removeEventListener: (type, cb) => {
      if (type === 'message') listeners.delete(cb);
    },
    setTimeout: (fn) => {
      if (timeoutImmediately) queueMicrotask(fn);
      return 1;
    },
    clearTimeout: () => {},
    postMessage: (message) => {
      lastMessage = message;
    },
    __dispatchMessage: (payload) => {
      for (const cb of listeners) {
        cb({ source: win, data: payload });
      }
    },
    __getLastMessage: () => lastMessage,
  };

  return win;
}

function loadScript(win, requestId = 'req-1') {
  const code = readFileSync(scriptPath, 'utf8');
  vm.runInNewContext(code, {
    window: win,
    crypto: { randomUUID: () => requestId },
    queueMicrotask,
    Error,
  });
}

test('exposes AGENTS_IN_BROWSER API in main world', () => {
  const win = createWindow();
  loadScript(win);

  assert.ok(win.AGENTS_IN_BROWSER);
  assert.equal(win.AGENTS_IN_BROWSER.version, '0.1.0');
  assert.equal(win.AGENTS_IN_BROWSER.available, true);
  assert.equal(typeof win.AGENTS_IN_BROWSER.execute, 'function');
  assert.equal(typeof win.AGENTS_IN_BROWSER.executeTask, 'function');
  assert.equal(typeof win.AGENTS_IN_BROWSER.stop, 'function');
  assert.equal(typeof win.AGENTS_IN_BROWSER.status, 'function');
  assert.equal(typeof win.AGENTS_IN_BROWSER.onStatus, 'function');
});

test('execute sends bridge request and resolves with response result', async () => {
  const win = createWindow();
  loadScript(win, 'req-exec');

  const promise = win.AGENTS_IN_BROWSER.execute('return 42;');
  const sent = win.__getLastMessage();

  assert.equal(sent.source, 'acp-main-world');
  assert.equal(sent.type, 'request');
  assert.equal(sent.action, 'execute');
  assert.equal(sent.requestId, 'req-exec');
  assert.equal(JSON.stringify(sent.payload), JSON.stringify({ code: 'return 42;' }));

  win.__dispatchMessage({
    source: 'acp-content-bridge',
    type: 'response',
    requestId: 'req-exec',
    success: true,
    result: { ok: true },
  });

  const result = await promise;
  assert.equal(JSON.stringify(result), JSON.stringify({ ok: true }));
});

test('execute rejects when bridge returns unsuccessful response', async () => {
  const win = createWindow();
  loadScript(win, 'req-fail');

  const promise = win.AGENTS_IN_BROWSER.execute('throw new Error()');

  win.__dispatchMessage({
    source: 'acp-content-bridge',
    type: 'response',
    requestId: 'req-fail',
    success: false,
    error: 'blocked',
  });

  await assert.rejects(promise, /blocked/);
});

test('execute rejects on timeout when no bridge response is received', async () => {
  const win = createWindow({ timeoutImmediately: true });
  loadScript(win, 'req-timeout');

  const promise = win.AGENTS_IN_BROWSER.execute('return 1;');
  await assert.rejects(promise, /timed out/i);
});


test('onStatus receives pushed status updates and unsubscribe works', async () => {
  const win = createWindow();
  loadScript(win, 'req-status');

  const updates = [];
  const unsubscribe = win.AGENTS_IN_BROWSER.onStatus((status) => updates.push(status));

  // initial status comes from bridge status call
  win.__dispatchMessage({
    source: 'acp-content-bridge',
    type: 'response',
    requestId: 'req-status',
    success: true,
    result: { agentActive: false, activeTabId: null },
  });

  win.__dispatchMessage({
    source: 'acp-content-bridge',
    type: 'status_update',
    status: { agentActive: true, activeTabId: 7 },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const beforeUnsubscribe = updates.length;
  unsubscribe();

  win.__dispatchMessage({
    source: 'acp-content-bridge',
    type: 'status_update',
    status: { agentActive: false, activeTabId: null },
  });

  assert.equal(updates.length, beforeUnsubscribe);
  assert.equal(
    updates.some((u) => JSON.stringify(u) === JSON.stringify({ agentActive: true, activeTabId: 7 })),
    true,
  );
});

test('executeTask returns wrapped result for aligned API shape', async () => {
  const win = createWindow();
  loadScript(win, 'req-task');

  const promise = win.AGENTS_IN_BROWSER.executeTask('return 99');
  win.__dispatchMessage({
    source: 'acp-content-bridge',
    type: 'response',
    requestId: 'req-task',
    success: true,
    result: 99,
  });

  const result = await promise;
  assert.equal(JSON.stringify(result), JSON.stringify({ status: 'success', result: 99 }));
});
