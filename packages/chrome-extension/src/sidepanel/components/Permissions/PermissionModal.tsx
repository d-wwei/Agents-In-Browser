import { useCallback } from "react";
import { Shield, CheckCircle2, XCircle } from "lucide-react";
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
  const resolveRequest = usePermissionStore((s) => s.resolveRequest);
  const isResolved = request.resolved;
  const wasApproved = request.approved;

  const handleResponse = useCallback(
    (approved: boolean, remember: boolean = false) => {
      sendWsMessage("permission_response", {
        requestId: request.requestId,
        approved,
        remember,
      });
      resolveRequest(request.requestId, approved);
    },
    [sendWsMessage, request.requestId, resolveRequest],
  );

  const detailEntries = Object.entries(request.details).filter(
    ([_, v]) => v !== undefined && v !== null,
  );

  return (
    <div
      className="mx-3 my-1.5 rounded-xl p-4 animate-fade-in"
      style={{
        background: "#1e2640",
        border: "1px solid rgba(255,255,255,0.22)",
        boxShadow: isResolved
          ? "0 4px 12px rgba(0,0,0,0.5)"
          : "0 4px 16px rgba(0,0,0,0.5), 0 0 12px rgba(110,231,183,0.08)",
      }}
      role="alert"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {!isResolved ? (
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
            <Shield size={16} className="text-accent" aria-hidden="true" />
          </div>
        ) : wasApproved ? (
          <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
        ) : (
          <XCircle size={18} className="text-error" aria-hidden="true" />
        )}
        <span className="text-[13px] font-semibold text-text-primary">
          {!isResolved
            ? "Permission Request"
            : wasApproved
              ? "Allowed"
              : "Denied"}
        </span>
      </div>

      {/* Action */}
      <div className="mb-3">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-accent"
          style={{
            background: "rgba(110,231,183,0.1)",
            border: "1px solid rgba(110,231,183,0.2)",
          }}
        >
          {request.action}
        </span>
        {request.url && (
          <p className="text-[11px] text-text-muted mt-1.5">on {request.url}</p>
        )}
      </div>

      {/* Details */}
      {detailEntries.length > 0 && (
        <div className="bg-bg-input rounded-lg p-2.5 mb-3 border border-border">
          {detailEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-[11px]">
              <span className="text-text-muted shrink-0">{key}:</span>
              <span className="text-text-secondary break-all">
                {typeof value === "string" ? value : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleResponse(false)}
            className="flex-1 h-10 rounded-[10px] border border-border text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          >
            Deny
          </button>
          <button
            onClick={() => handleResponse(true)}
            className="flex-1 h-10 rounded-[10px] bg-accent hover:bg-accent-hover text-bg-primary text-[13px] font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          >
            Allow
          </button>
          <button
            onClick={() => handleResponse(true, true)}
            className="px-3 h-10 rounded-[10px] border border-accent/30 text-accent text-[11px] hover:bg-accent/10 transition-colors duration-150 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent/50 outline-none"
          >
            Always
          </button>
        </div>
      )}
    </div>
  );
}
