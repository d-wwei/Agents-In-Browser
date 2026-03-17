/**
 * Main world bridge script.
 * Injected only for the active agent tab so page scripts can call extension helpers.
 */

declare global {
  interface Window {
    AGENTS_IN_BROWSER?: {
      version: string;
      available: boolean;
      execute: (code: string) => Promise<unknown>;
      executeTask: (task: string) => Promise<{ status: "success"; result: unknown }>;
      stop: () => Promise<{ stopped: boolean }>;
      status: () => Promise<{ agentActive: boolean; activeTabId: number | null }>;
      onStatus: (callback: (status: { agentActive: boolean; activeTabId: number | null }) => void) => () => void;
    };
  }
}

type MainWorldAction = "execute" | "stop" | "status";

const BRIDGE_TIMEOUT_MS = 10_000;

interface MainWorldBridgeRequest {
  source: "acp-main-world";
  type: "request";
  action: MainWorldAction;
  requestId: string;
  payload?: Record<string, unknown>;
}

interface MainWorldBridgeResponse {
  source: "acp-content-bridge";
  type: "response";
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

interface MainWorldStatusUpdate {
  source: "acp-content-bridge";
  type: "status_update";
  status: { agentActive: boolean; activeTabId: number | null };
}

if (!window.AGENTS_IN_BROWSER) {
  const statusListeners = new Set<(status: { agentActive: boolean; activeTabId: number | null }) => void>();

  const callBridge = async (action: MainWorldAction, payload?: Record<string, unknown>): Promise<unknown> => {
    const requestId = crypto.randomUUID();
    const message: MainWorldBridgeRequest = {
      source: "acp-main-world",
      type: "request",
      action,
      requestId,
      payload,
    };

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        reject(new Error(`Bridge request timed out after ${BRIDGE_TIMEOUT_MS}ms`));
      }, BRIDGE_TIMEOUT_MS);

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data = event.data as MainWorldBridgeResponse | undefined;
        if (!data || data.source !== "acp-content-bridge" || data.type !== "response") return;
        if (data.requestId !== requestId) return;

        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        if (!data.success) {
          reject(new Error(data.error || "Unknown bridge error"));
          return;
        }
        resolve(data.result);
      };

      window.addEventListener("message", onMessage);
      window.postMessage(message, "*");
    });
  };

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as MainWorldStatusUpdate | undefined;
    if (!data || data.source !== "acp-content-bridge" || data.type !== "status_update") return;
    for (const listener of statusListeners) {
      listener(data.status);
    }
  });

  window.AGENTS_IN_BROWSER = {
    version: "0.1.0",
    available: true,
    execute: (code: string) => callBridge("execute", { code }),
    executeTask: async (task: string) => ({
      status: "success",
      result: await callBridge("execute", { code: task }),
    }),
    stop: () => callBridge("stop") as Promise<{ stopped: boolean }>,
    status: () => callBridge("status") as Promise<{ agentActive: boolean; activeTabId: number | null }>,
    onStatus: (callback) => {
      statusListeners.add(callback);
      callBridge("status")
        .then((status) => callback(status as { agentActive: boolean; activeTabId: number | null }))
        .catch(() => {});
      return () => {
        statusListeners.delete(callback);
      };
    },
  };
}

export {};
