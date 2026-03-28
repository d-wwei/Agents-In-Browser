import type {
  ApiResponse,
  Feedback,
  HealthData,
  RunResult,
  SkillBank,
  SkillSEKitOptions,
} from "./types.js";

/**
 * TypeScript client for the Skill-SE-Kit HTTP sidecar.
 *
 * Requires `skill-se-kit serve` to be running.
 *
 * @example
 * ```ts
 * import { SkillSEKit } from '@skill-se-kit/adapter';
 *
 * const kit = new SkillSEKit({ port: 9780 });
 * const result = await kit.run(
 *   { task: 'browse', url: 'https://example.com' },
 *   { status: 'positive', lesson: 'Use page.evaluate() for shadow DOM', source: 'explicit', confidence: 0.9 }
 * );
 * console.log(result.autonomous_cycle?.decision);
 * ```
 */
export class SkillSEKit {
  private readonly baseUrl: string;

  constructor(options: SkillSEKitOptions = {}) {
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? 9780;
    this.baseUrl = `http://${host}:${port}`;
  }

  /** Health check — returns version and status. */
  async health(): Promise<HealthData> {
    return this.get<HealthData>("/health");
  }

  /**
   * Execute a skill turn with optional feedback.
   *
   * Maps to `runtime.run_integrated_skill()`.
   */
  async run(
    input: Record<string, unknown>,
    feedback?: Feedback,
    context?: Record<string, unknown>,
  ): Promise<RunResult> {
    return this.post<RunResult>("/run", { input, feedback, context });
  }

  /** Get the current skill bank. */
  async getSkills(): Promise<SkillBank> {
    return this.get<SkillBank>("/skills");
  }

  /** Get the latest evolution summary as plain text. */
  async getReport(): Promise<string> {
    const data = await this.get<{ text: string }>("/report");
    return data.text;
  }

  /** Get the latest evolution report as structured JSON. */
  async getReportJson(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>("/report/json");
  }

  /** Rollback to a recorded snapshot. */
  async rollback(snapshotId: string): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>("/rollback", {
      snapshot_id: snapshotId,
    });
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`);
    return this.unwrap<T>(resp);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.unwrap<T>(resp);
  }

  private async unwrap<T>(resp: Response): Promise<T> {
    const payload: ApiResponse<T> = await resp.json();
    if (!payload.ok) {
      throw new Error(
        `skill-se-kit error: ${payload.error ?? "unknown error"}`,
      );
    }
    return payload.data as T;
  }
}
