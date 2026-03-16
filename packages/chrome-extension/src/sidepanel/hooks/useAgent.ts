import { useCallback } from "react";
import { useAgentStore } from "../store/agentStore";
import { useChatStore } from "../store/chatStore";
import {
  CONTEXT_CARRY_MAX_MESSAGES,
  CONTEXT_CARRY_MAX_TOKENS,
} from "@anthropic-ai/acp-browser-shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAgentReturn {
  currentAgent: ReturnType<typeof useAgentStore.getState>["agents"][number] | undefined;
  agents: ReturnType<typeof useAgentStore.getState>["agents"];
  switchAgent: (agentId: string, options?: SwitchOptions) => Promise<void>;
}

export interface SwitchOptions {
  carryContext?: boolean;
  sendSwitch?: (agentId: string, carryContext: boolean) => void;
}

// ---------------------------------------------------------------------------
// Rough token estimate (1 token ~ 4 chars for English, ~2 chars for CJK)
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  let cjkCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Ext A
      (code >= 0x3000 && code <= 0x303f) // CJK Symbols
    ) {
      cjkCount++;
    }
  }
  const nonCjk = text.length - cjkCount;
  return Math.ceil(nonCjk / 4) + Math.ceil(cjkCount / 2);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgent(): UseAgentReturn {
  const agents = useAgentStore((s) => s.agents);
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const storeSwitch = useAgentStore((s) => s.switchAgent);

  const messages = useChatStore((s) => s.messages);
  const newSession = useChatStore((s) => s.newSession);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const currentAgent = agents.find((a) => a.id === currentAgentId);

  const switchAgent = useCallback(
    async (agentId: string, options?: SwitchOptions) => {
      const { carryContext = false, sendSwitch } = options ?? {};

      if (agentId === currentAgentId) return;

      const targetAgent = agents.find((a) => a.id === agentId);
      if (!targetAgent) return;

      // Switch in store
      storeSwitch(agentId);

      // Notify proxy server
      if (sendSwitch) {
        sendSwitch(agentId, carryContext);
      }

      // Create new session for this agent
      const session = await newSession(agentId, targetAgent.icon);

      // Carry context: take recent messages and inject as context
      if (carryContext && messages.length > 0) {
        const recentMessages = messages.slice(-CONTEXT_CARRY_MAX_MESSAGES);
        let tokenBudget = CONTEXT_CARRY_MAX_TOKENS;
        const carried: string[] = [];

        for (const msg of recentMessages) {
          const tokens = estimateTokens(msg.content);
          if (tokenBudget - tokens < 0 && carried.length > 0) break;
          carried.push(`[${msg.role}]: ${msg.content}`);
          tokenBudget -= tokens;
        }

        if (carried.length > 0) {
          const contextSummary = `[Context from previous agent conversation]\n\n${carried.join("\n\n")}`;
          await sendMessage(contextSummary, agentId, targetAgent.icon);
        }
      }
    },
    [currentAgentId, agents, storeSwitch, newSession, sendMessage, messages],
  );

  return { currentAgent, agents, switchAgent };
}
