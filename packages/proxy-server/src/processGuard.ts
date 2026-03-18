import { EventEmitter } from "events";
import { AcpClient, type AcpClientOptions } from "./acpClient";
import {
  PROCESS_RESTART_MAX_ATTEMPTS,
  PROCESS_RESTART_BASE_MS,
  PROCESS_RESTART_MAX_MS,
  RECONNECT_MULTIPLIER,
} from "@anthropic-ai/acp-browser-shared";

export class ProcessGuard extends EventEmitter {
  private client: AcpClient;
  private options: AcpClientOptions | null = null;
  private restartCount = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private exitHandler: (code: number | null, signal: string | null) => void;
  private errorHandler: (err: Error) => void;

  constructor(client: AcpClient) {
    super();
    this.client = client;

    this.exitHandler = (code, signal) => {
      if (this.stopped) return;
      console.warn(
        `[ProcessGuard] Agent exited (code=${code}, signal=${signal}), attempt restart...`,
      );
      this.scheduleRestart();
    };

    this.errorHandler = (err) => {
      if (this.stopped) return;
      console.error(`[ProcessGuard] Agent error: ${err.message}`);
      this.scheduleRestart();
    };

    this.client.on("exit", this.exitHandler);
    this.client.on("error", this.errorHandler);
  }

  setOptions(options: AcpClientOptions) {
    this.options = options;
    this.restartCount = 0;
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  resetRestartCount() {
    this.restartCount = 0;
  }

  private scheduleRestart() {
    if (!this.options) return;

    if (this.restartCount >= PROCESS_RESTART_MAX_ATTEMPTS) {
      console.error(
        `[ProcessGuard] Max restart attempts (${PROCESS_RESTART_MAX_ATTEMPTS}) reached, giving up`,
      );
      this.emit("give_up");
      return;
    }

    const delay = Math.min(
      PROCESS_RESTART_BASE_MS *
        Math.pow(RECONNECT_MULTIPLIER, this.restartCount),
      PROCESS_RESTART_MAX_MS,
    );

    console.log(
      `[ProcessGuard] Restarting in ${delay}ms (attempt ${this.restartCount + 1}/${PROCESS_RESTART_MAX_ATTEMPTS})`,
    );

    this.restartTimer = setTimeout(async () => {
      this.restartCount++;
      try {
        await this.client.start(this.options!);
        console.log("[ProcessGuard] Agent restarted successfully");
        this.emit("restarted");
      } catch (err) {
        console.error(
          `[ProcessGuard] Restart failed: ${(err as Error).message}`,
        );
        this.scheduleRestart();
      }
    }, delay);
  }
}
