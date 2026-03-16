import { useCallback } from "react";
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
      className={`mx-3 my-1.5 rounded-lg border-l-3 p-3 animate-fade-in ${
        isResolved
          ? wasApproved
            ? "border-success/50 bg-success/5"
            : "border-error/50 bg-error/5"
          : "border-warning bg-warning/5"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {!isResolved ? (
          <svg
            className="w-4 h-4 text-warning shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 1L1 14h14L8 1z" />
            <line x1="8" y1="6" x2="8" y2="9" />
            <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
          </svg>
        ) : wasApproved ? (
          <svg
            className="w-4 h-4 text-success shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3.5 8 6.5 11 12.5 5" />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 text-error shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="4" y1="4" x2="12" y2="12" />
            <line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        )}
        <span className="text-[12px] font-medium text-text-primary">
          {!isResolved
            ? "Permission Required"
            : wasApproved
              ? "Allowed"
              : "Denied"}
        </span>
      </div>

      {/* Action description */}
      <div className="text-[12px] text-text-secondary mb-2">
        <span className="font-medium text-text-primary">{request.action}</span>
        {request.url && (
          <span className="text-text-muted ml-1">on {request.url}</span>
        )}
      </div>

      {/* Details */}
      {detailEntries.length > 0 && (
        <div className="bg-bg-primary rounded p-2 mb-2">
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

      {/* Action buttons */}
      {!isResolved && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleResponse(true)}
            className="px-3 py-1 text-[11px] font-medium rounded bg-accent hover:bg-accent-hover text-white transition-colors"
          >
            Allow
          </button>
          <button
            onClick={() => handleResponse(false)}
            className="px-3 py-1 text-[11px] font-medium rounded bg-bg-hover hover:bg-border text-text-primary transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => handleResponse(true, true)}
            className="px-3 py-1 text-[11px] rounded border border-accent/40 text-accent hover:bg-accent/10 transition-colors ml-auto"
          >
            Always Allow
          </button>
        </div>
      )}
    </div>
  );
}
