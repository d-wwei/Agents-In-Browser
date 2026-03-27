import { isSystemCommand } from "@anthropic-ai/agents-in-browser-shared";

export interface ParsedCommand {
  command: string; // e.g. "new", "status" (without leading /)
  args: string[]; // parsed arguments
  rawArgs: string; // everything after the command name
}

/**
 * Parse user input into a system command if it matches.
 * Returns null if the input is not a recognized system command
 * (it may still be an agent shortcut like /summarize).
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIndex = trimmed.indexOf(" ");
  const commandPart = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const commandName = commandPart.slice(1); // strip leading "/"

  if (!isSystemCommand(commandName)) return null;

  const rawArgs = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
  const args = rawArgs ? rawArgs.split(/\s+/) : [];

  return { command: commandName, args, rawArgs };
}
