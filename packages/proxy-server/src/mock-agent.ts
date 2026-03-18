#!/usr/bin/env npx tsx
/**
 * Mock ACP Agent for testing.
 * Responds to JSON-RPC 2.0 over stdio, simulating an AI coding agent.
 * Usage: npx tsx packages/proxy-server/src/mock-agent.ts
 */

import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin });

function send(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sendNotification(method: string, params: unknown) {
  send({ jsonrpc: "2.0", method, params });
}

function sendResponse(id: number | string, result: unknown) {
  send({ jsonrpc: "2.0", id, result });
}

let sessionCounter = 0;
const activeStreams = new Map<
  string,
  { cancelled: boolean; timer: ReturnType<typeof setTimeout> | null; promptId?: number | string }
>();

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: { jsonrpc: string; id?: number | string; method: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(trimmed);
  } catch {
    process.stderr.write(`[MockAgent] Failed to parse JSON: ${trimmed.slice(0, 200)}\n`);
    return;
  }

  switch (msg.method) {
    case "initialize": {
      sendResponse(msg.id!, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: true, mcp: true },
        serverInfo: {
          name: "mock-acp-agent",
          version: "0.1.0",
        },
      });
      break;
    }

    case "session/new": {
      sessionCounter++;
      activeStreams.set(`mock-session-${sessionCounter}`, {
        cancelled: false,
        timer: null,
      });
      sendResponse(msg.id!, {
        sessionId: `mock-session-${sessionCounter}`,
      });
      break;
    }

    case "session/prompt": {
      const sessionId = (msg.params as Record<string, unknown>).sessionId as string;
      const stream =
        activeStreams.get(sessionId) || { cancelled: false, timer: null };
      stream.cancelled = false;
      stream.promptId = msg.id;
      activeStreams.set(sessionId, stream);
      const promptChunks = (msg.params as Record<string, unknown>).prompt;
      const prompt = Array.isArray(promptChunks)
        ? promptChunks.map((c: { text?: string }) => c.text || "").join("")
        : String(promptChunks ?? "");

      // Simulate streaming response
      const reply = `你好！我是 Mock ACP Agent，收到了你的消息：\n\n> ${prompt}\n\n这是一个测试回复，说明整条消息通路（Chrome 扩展 → WebSocket → Proxy Server → Agent）已经完全打通。🎉\n\n当前会话 ID: ${sessionId}`;

      // Send text in chunks to simulate streaming
      const chunks = reply.match(/.{1,20}/g) || [reply];
      let i = 0;

      const sendChunk = () => {
        const current = activeStreams.get(sessionId);
        if (current?.cancelled) {
          sendResponse(msg.id!, { status: "cancelled" });
          activeStreams.delete(sessionId);
          return;
        }
        if (i < chunks.length) {
          sendNotification("session/update", {
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: chunks[i] },
            },
          });
          i++;
          const nextTimer = setTimeout(sendChunk, 50);
          if (current) {
            current.timer = nextTimer;
            activeStreams.set(sessionId, current);
          }
        } else {
          // Done - send response
          sendResponse(msg.id!, { status: "complete" });
          activeStreams.delete(sessionId);
        }
      };

      sendChunk();
      break;
    }

    case "session/cancel": {
      const sessionId = (msg.params as Record<string, unknown>).sessionId as string;
      const stream = activeStreams.get(sessionId);
      if (stream) {
        stream.cancelled = true;
        if (stream.timer) {
          clearTimeout(stream.timer);
          stream.timer = null;
        }
        activeStreams.set(sessionId, stream);
      }
      sendResponse(msg.id!, { status: "cancelled" });
      break;
    }

    case "permission/respond": {
      sendResponse(msg.id!, { status: "ok" });
      break;
    }

    default: {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      });
    }
  }
});

process.stderr.write("[MockAgent] Ready\n");
