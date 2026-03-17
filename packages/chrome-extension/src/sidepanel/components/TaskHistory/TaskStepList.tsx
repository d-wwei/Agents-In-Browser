import type { TaskStep } from "../../store/chatStore";

interface TaskStepListProps {
  steps: TaskStep[];
}

export default function TaskStepList({ steps }: TaskStepListProps) {
  if (steps.length === 0) {
    return <p className="text-[12px] text-text-muted">No tool steps recorded for this session yet.</p>;
  }

  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div key={step.id} className="rounded border border-border bg-bg-secondary p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] text-text-primary font-medium">
              #{step.stepIndex} {step.action}
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                step.status === "complete"
                  ? "bg-success/15 text-success"
                  : step.status === "error"
                    ? "bg-error/15 text-error"
                    : "bg-accent/15 text-accent"
              }`}
            >
              {step.status}
            </span>
          </div>

          <div className="mt-2 text-[10px] text-text-muted uppercase tracking-wider">Args</div>
          <pre className="text-[11px] text-text-secondary bg-bg-primary rounded p-2 overflow-x-auto max-h-28 overflow-y-auto">
            <code>{JSON.stringify(step.args, null, 2)}</code>
          </pre>

          {step.screenshot && (
            <>
              <div className="mt-2 text-[10px] text-text-muted uppercase tracking-wider">Screenshot</div>
              <img
                src={step.screenshot}
                alt={`Step ${step.stepIndex} screenshot`}
                className="mt-1 rounded border border-border max-h-28 object-contain bg-bg-primary"
              />
            </>
          )}

          {(step.result !== undefined || step.error) && (
            <>
              <div className="mt-2 text-[10px] text-text-muted uppercase tracking-wider">
                {step.error ? "Error" : "Result"}
              </div>
              <pre
                className={`text-[11px] rounded p-2 overflow-x-auto max-h-28 overflow-y-auto ${
                  step.error ? "text-error bg-error/10" : "text-text-secondary bg-bg-primary"
                }`}
              >
                <code>{step.error ?? JSON.stringify(step.result, null, 2)}</code>
              </pre>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
