import { useCallback } from "react";
import { Globe, ListChecks, X } from "lucide-react";
import {
  usePermissionStore,
  type PermissionEntry,
} from "../../store/permissionStore";

interface PermissionModalProps {
  request: PermissionEntry;
  sendWsMessage: (type: string, payload: Record<string, unknown>) => void;
}

export default function PermissionModal({
  request,
  sendWsMessage,
}: PermissionModalProps) {
  const resolve = usePermissionStore((s) => s.resolveRequest);

  const respond = useCallback(
    (decision: "allow" | "deny" | "always") => {
      const approved = decision !== "deny";
      resolve(request.requestId, approved);
      sendWsMessage("permission_response", {
        requestId: request.requestId,
        approved,
        remember: decision === "always",
      });
    },
    [request.requestId, resolve, sendWsMessage],
  );

  if (request.resolved) return null;

  const ext = request as unknown as Record<string, string | undefined>;
  const rawTool = ext.tool || request.action || "unknown";
  const toolLabel = rawTool
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const agentName = ext.agentName || "Agent";
  const description = ext.description;
  const siteLabel = (() => {
    if (!request.url) return "Current site";
    try {
      return new URL(request.url).hostname || request.url;
    } catch {
      return request.url;
    }
  })();
  const stepText =
    description?.trim() ||
    `Allow ${toolLabel.toLowerCase()} in the current tab`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(15,17,23,0.6)" }}
        onClick={() => respond("deny")}
      />

      {/* Modal */}
      <div
        className="relative w-[352px] mx-6"
        style={{
          backgroundColor: "var(--card, #1e2538)",
          borderRadius: 18,
          border: "1px solid var(--border-card, rgba(255,255,255,0.19))",
          boxShadow: "0 8px 28px rgba(0,0,0,0.36)",
          padding: 20,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between pb-3"
          style={{ borderBottom: "1px solid var(--border, rgba(255,255,255,0.18))" }}
        >
          <div className="flex items-center gap-2.5">
            <ListChecks size={20} color="var(--text-primary, #d1d5db)" />
            <h3
              className="text-base font-semibold"
              style={{ color: "var(--text-primary, #d1d5db)" }}
            >
              Claude&apos;s plan
            </h3>
          </div>
          <button
            onClick={() => respond("deny")}
            className="transition-colors cursor-pointer"
            style={{ color: "var(--text-muted, #6b7280)" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 pt-3">
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted, #6b7280)" }}>
            Allow actions on these sites
          </p>
          <div
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl w-fit"
            style={{
              border: "1px solid var(--border, rgba(255,255,255,0.18))",
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            <Globe size={16} color="var(--text-muted, #9ca3af)" />
            <span
              className="text-[15px] font-bold"
              style={{ color: "var(--text-primary, #d1d5db)" }}
            >
              {siteLabel}
            </span>
          </div>

          <p className="text-xs font-semibold" style={{ color: "var(--text-muted, #6b7280)" }}>
            Approach to follow
          </p>
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
              style={{
                border: "1px solid var(--border, rgba(255,255,255,0.18))",
                color: "var(--text-muted, #9ca3af)",
              }}
            >
              1
            </div>
            <p
              className="text-sm font-semibold leading-snug"
              style={{ color: "var(--text-primary, #d1d5db)" }}
            >
              {stepText}
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2.5 mt-4">
          <button
            onClick={() => respond("allow")}
            className="h-[52px] rounded-[14px] text-[15px] font-bold transition-opacity cursor-pointer"
            style={{ backgroundColor: "var(--accent, #6ee7b7)", color: "var(--bg-primary, #0f1117)" }}
          >
            Approve plan
          </button>
          <button
            onClick={() => respond("deny")}
            className="h-[52px] rounded-[14px] text-[15px] font-semibold transition-colors cursor-pointer"
            style={{
              border: "1px solid var(--border, rgba(255,255,255,0.18))",
              color: "var(--text-primary, #d1d5db)",
              backgroundColor: "transparent",
            }}
          >
            Make changes
          </button>
        </div>

        <p
          className="text-xs leading-relaxed mt-3"
          style={{ color: "var(--text-muted, #6b7280)" }}
        >
          {agentName} will only use listed sites. You&apos;ll be asked before
          accessing anything else.
        </p>
      </div>
    </div>
  );
}
