import { create } from "zustand";
import type { PermissionRequestPayload } from "@anthropic-ai/agents-in-browser-shared";

export interface PermissionEntry extends PermissionRequestPayload {
  resolved?: boolean;
  approved?: boolean;
}

export interface PermissionStoreState {
  requests: PermissionEntry[];
  addRequest: (request: PermissionRequestPayload) => void;
  resolveRequest: (requestId: string, approved: boolean) => void;
  clearResolved: () => void;
}

export const usePermissionStore = create<PermissionStoreState>((set) => ({
  requests: [],

  addRequest(request) {
    set((s) => ({
      requests: [
        ...s.requests,
        { ...request, resolved: false },
      ],
    }));
  },

  resolveRequest(requestId, approved) {
    set((s) => ({
      requests: s.requests.map((r) =>
        r.requestId === requestId ? { ...r, resolved: true, approved } : r,
      ),
    }));
  },

  clearResolved() {
    set((s) => ({
      requests: s.requests.filter((r) => !r.resolved),
    }));
  },
}));
