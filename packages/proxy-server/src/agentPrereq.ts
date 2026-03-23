import { spawn } from "child_process";
import { existsSync } from "fs";
import { delimiter, isAbsolute, join } from "path";

function getPathEntries(env: NodeJS.ProcessEnv): string[] {
  const rawPath = env.PATH || env.Path || env.path || "";
  return rawPath.split(delimiter).filter(Boolean);
}

function getExecutableCandidates(command: string, env: NodeJS.ProcessEnv): string[] {
  if (command.includes("/") || command.includes("\\")) {
    return [command];
  }

  const entries = getPathEntries(env);
  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];

  const candidates: string[] = [];
  for (const entry of entries) {
    for (const ext of extensions) {
      candidates.push(join(entry, `${command}${ext}`));
    }
  }
  return candidates;
}

export function isCommandAvailable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd?: string,
): boolean {
  if (!command) return false;
  if (isAbsolute(command)) {
    return existsSync(command);
  }
  if (cwd && (command.startsWith("./") || command.startsWith(".\\"))) {
    return existsSync(join(cwd, command));
  }
  return getExecutableCandidates(command, env).some((candidate) => existsSync(candidate));
}

export async function installAgentDependencies(
  instructions: string,
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const shellCommand =
      process.platform === "win32"
        ? { command: "cmd.exe", args: ["/d", "/s", "/c", instructions] }
        : { command: "/bin/sh", args: ["-lc", instructions] };

    const child = spawn(shellCommand.command, shellCommand.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let output = "";
    const append = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 16_000) {
        output = output.slice(-16_000);
      }
    };

    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => {
      resolve({ success: false, output: `${output}\n${error.message}`.trim() });
    });
    child.on("exit", (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
      });
    });
  });
}
