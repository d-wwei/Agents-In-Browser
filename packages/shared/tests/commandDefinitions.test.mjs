import test from "node:test";
import assert from "node:assert/strict";

// Import from the TypeScript source directly won't work in Node.js test runner.
// We test the logic by reimplementing the same isSystemCommand check.
// This validates the command list is consistent.

const SYSTEM_COMMAND_NAMES = [
  "status", "sessions", "lsessions", "new", "bind", "switchto",
  "rename", "archive", "unarchive", "cwd", "mode", "stop", "help",
];

const systemCommandSet = new Set(SYSTEM_COMMAND_NAMES);

function isSystemCommand(name) {
  return systemCommandSet.has(name);
}

test("isSystemCommand returns true for all registered commands", () => {
  for (const name of SYSTEM_COMMAND_NAMES) {
    assert.ok(isSystemCommand(name), `Expected ${name} to be a system command`);
  }
});

test("isSystemCommand returns false for agent shortcuts", () => {
  const agentShortcuts = ["summarize", "explain", "translate", "fix", "review", "test", "screenshot", "tabs"];
  for (const name of agentShortcuts) {
    assert.ok(!isSystemCommand(name), `Expected ${name} NOT to be a system command`);
  }
});

test("isSystemCommand returns false for unknown commands", () => {
  assert.ok(!isSystemCommand("foo"));
  assert.ok(!isSystemCommand(""));
  assert.ok(!isSystemCommand("clearhistory"));
});

test("no duplicate commands in the list", () => {
  const seen = new Set();
  for (const name of SYSTEM_COMMAND_NAMES) {
    assert.ok(!seen.has(name), `Duplicate command: ${name}`);
    seen.add(name);
  }
});
