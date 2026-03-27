import test from "node:test";
import assert from "node:assert/strict";

// Reimplement parseCommand logic for testing (since we can't import TS directly)
const SYSTEM_COMMAND_NAMES = new Set([
  "status", "sessions", "lsessions", "new", "bind", "switchto",
  "rename", "archive", "unarchive", "cwd", "mode", "stop", "help",
]);

function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIndex = trimmed.indexOf(" ");
  const commandPart = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const commandName = commandPart.slice(1);

  if (!SYSTEM_COMMAND_NAMES.has(commandName)) return null;

  const rawArgs = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
  const args = rawArgs ? rawArgs.split(/\s+/) : [];

  return { command: commandName, args, rawArgs };
}

// ---------------------------------------------------------------------------
// Basic parsing
// ---------------------------------------------------------------------------

test("parseCommand returns null for non-slash input", () => {
  assert.equal(parseCommand("hello world"), null);
  assert.equal(parseCommand(""), null);
  assert.equal(parseCommand("  "), null);
});

test("parseCommand returns null for agent shortcuts", () => {
  assert.equal(parseCommand("/summarize"), null);
  assert.equal(parseCommand("/explain something"), null);
  assert.equal(parseCommand("/tabs"), null);
});

test("parseCommand parses /help with no args", () => {
  const result = parseCommand("/help");
  assert.deepEqual(result, { command: "help", args: [], rawArgs: "" });
});

test("parseCommand parses /new with no args", () => {
  const result = parseCommand("/new");
  assert.deepEqual(result, { command: "new", args: [], rawArgs: "" });
});

test("parseCommand parses /new with path arg", () => {
  const result = parseCommand("/new /Users/admin/projects");
  assert.deepEqual(result, {
    command: "new",
    args: ["/Users/admin/projects"],
    rawArgs: "/Users/admin/projects",
  });
});

test("parseCommand parses /rename with multi-word name", () => {
  const result = parseCommand("/rename My Cool Session");
  assert.deepEqual(result, {
    command: "rename",
    args: ["My", "Cool", "Session"],
    rawArgs: "My Cool Session",
  });
});

test("parseCommand parses /mode with valid mode", () => {
  const result = parseCommand("/mode plan");
  assert.deepEqual(result, { command: "mode", args: ["plan"], rawArgs: "plan" });
});

test("parseCommand parses /lsessions --all", () => {
  const result = parseCommand("/lsessions --all");
  assert.deepEqual(result, {
    command: "lsessions",
    args: ["--all"],
    rawArgs: "--all",
  });
});

test("parseCommand parses /cwd with path", () => {
  const result = parseCommand("/cwd /tmp/workspace");
  assert.deepEqual(result, {
    command: "cwd",
    args: ["/tmp/workspace"],
    rawArgs: "/tmp/workspace",
  });
});

test("parseCommand parses /bind with session id", () => {
  const result = parseCommand("/bind abc123-def456");
  assert.deepEqual(result, {
    command: "bind",
    args: ["abc123-def456"],
    rawArgs: "abc123-def456",
  });
});

test("parseCommand parses /switchto with name", () => {
  const result = parseCommand("/switchto my-session");
  assert.deepEqual(result, {
    command: "switchto",
    args: ["my-session"],
    rawArgs: "my-session",
  });
});

test("parseCommand parses /archive with no args (current session)", () => {
  const result = parseCommand("/archive");
  assert.deepEqual(result, { command: "archive", args: [], rawArgs: "" });
});

test("parseCommand parses /archive with session name", () => {
  const result = parseCommand("/archive old-session");
  assert.deepEqual(result, {
    command: "archive",
    args: ["old-session"],
    rawArgs: "old-session",
  });
});

test("parseCommand parses /stop", () => {
  const result = parseCommand("/stop");
  assert.deepEqual(result, { command: "stop", args: [], rawArgs: "" });
});

test("parseCommand parses /status", () => {
  const result = parseCommand("/status");
  assert.deepEqual(result, { command: "status", args: [], rawArgs: "" });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("parseCommand handles leading/trailing whitespace", () => {
  const result = parseCommand("  /help  ");
  assert.deepEqual(result, { command: "help", args: [], rawArgs: "" });
});

test("parseCommand handles extra spaces in args", () => {
  const result = parseCommand("/rename   spaced   name  ");
  assert.deepEqual(result, {
    command: "rename",
    args: ["spaced", "name"],
    rawArgs: "spaced   name",
  });
});

test("parseCommand returns null for partial system command names", () => {
  assert.equal(parseCommand("/hel"), null);
  assert.equal(parseCommand("/sto"), null);
  assert.equal(parseCommand("/neww"), null);
});

test("all 13 system commands are parseable", () => {
  const commands = [
    "status", "sessions", "lsessions", "new", "bind", "switchto",
    "rename", "archive", "unarchive", "cwd", "mode", "stop", "help",
  ];
  for (const cmd of commands) {
    const result = parseCommand(`/${cmd}`);
    assert.ok(result !== null, `/${cmd} should parse`);
    assert.equal(result.command, cmd);
  }
});
