import type { TaskStep } from "../../store/chatStore";

interface TaskStepListProps {
  steps: TaskStep[];
}

const statusColors: Record<string, { border: string; bg: string; text: string }> = {
  complete: { border: "#6ee7b7", bg: "rgba(110,231,183,0.12)", text: "#6ee7b7" },
  error: { border: "#f87171", bg: "rgba(248,113,113,0.12)", text: "#f87171" },
  running: { border: "#3b82f6", bg: "rgba(59,130,246,0.12)", text: "#60a5fa" },
};

export default function TaskStepList({ steps }: TaskStepListProps) {
  if (steps.length === 0) {
    return (
      <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#6b7280" }}>
        No tool steps recorded for this session yet.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map((step) => {
        const sc = statusColors[step.status] || statusColors.running;

        return (
          <div
            key={step.id}
            style={{
              borderRadius: 10, padding: 10,
              background: "var(--card, #1e2538)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderLeft: `2px solid ${sc.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: "#d1d5db" }}>
                #{step.stepIndex} {step.action}
              </span>
              <span style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                padding: "2px 6px", borderRadius: 6,
                background: sc.bg, color: sc.text,
              }}>
                {step.status}
              </span>
            </div>

            <div style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Args</div>
            <pre style={{
              margin: "4px 0 0", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 11, color: "#9ca3af",
              background: "#1a1d26", borderRadius: 8, padding: 8,
              overflowX: "auto", maxHeight: 112, overflowY: "auto",
            }}>
              <code>{JSON.stringify(step.args, null, 2)}</code>
            </pre>

            {step.screenshot && (
              <>
                <div style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Screenshot</div>
                <img
                  src={step.screenshot}
                  alt={`Step ${step.stepIndex} screenshot`}
                  style={{ marginTop: 4, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", maxHeight: 112, objectFit: "contain", background: "#1a1d26" }}
                />
              </>
            )}

            {(step.result !== undefined || step.error) && (
              <>
                <div style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {step.error ? "Error" : "Result"}
                </div>
                <pre style={{
                  margin: "4px 0 0", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 11,
                  borderRadius: 8, padding: 8, overflowX: "auto", maxHeight: 112, overflowY: "auto",
                  color: step.error ? "#f87171" : "#9ca3af",
                  background: step.error ? "rgba(248,113,113,0.08)" : "#1a1d26",
                }}>
                  <code>{step.error ?? JSON.stringify(step.result, null, 2)}</code>
                </pre>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
