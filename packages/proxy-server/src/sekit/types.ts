/**
 * TypeScript types aligned with schemas/feedback.schema.json
 * and schemas/run-result.schema.json.
 */

// ---------------------------------------------------------------------------
// Feedback (input to POST /run)
// ---------------------------------------------------------------------------

export interface Feedback {
  /** Whether the execution outcome was positive or negative. */
  status: "positive" | "negative";
  /** A reusable insight extracted from this execution. */
  lesson: string;
  /** Origin of this feedback. */
  source: "explicit" | "user_input" | "execution_result" | "default";
  /** Confidence in this feedback (0.0–1.0). Default: 1.0. */
  confidence?: number;
  /** Optional detailed reasoning behind the lesson. */
  reasoning?: string;
}

// ---------------------------------------------------------------------------
// Skill Bank
// ---------------------------------------------------------------------------

export interface SkillEntry {
  skill_entry_id: string;
  title: string;
  content: string;
  version: string;
  task_signature?: string;
  keywords?: string[];
  source_experience_ids?: string[];
  updated_at?: string;
}

export interface SkillBank {
  skills: SkillEntry[];
}

// ---------------------------------------------------------------------------
// Run result (output of POST /run)
// ---------------------------------------------------------------------------

export interface AutonomousCycleDecision {
  action: "add" | "merge" | "discard" | "supersede" | "skip";
  summary: string;
  skill_entry_id?: string;
  reason?: string;
  reasoning?: string;
}

export interface AutonomousCycle {
  execution_id: string;
  experience: Record<string, unknown>;
  decision: AutonomousCycleDecision;
  proposal: Record<string, unknown> | null;
  evaluation: Record<string, unknown> | null;
  promotion: Record<string, unknown> | null;
}

export interface RunResult {
  kit_active: boolean;
  runtime_mode: "off" | "manual" | "auto";
  execution_id?: string;
  task_signature?: string;
  retrieved?: {
    skills: SkillEntry[];
    experiences: Record<string, unknown>[];
  };
  result: Record<string, unknown>;
  autonomous_cycle?: AutonomousCycle;
  evolution_report?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Server response wrapper
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthData {
  version: string;
  skill_root: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface SkillSEKitOptions {
  /** Port of the skill-se-kit serve process. Default: 9780. */
  port?: number;
  /** Host of the skill-se-kit serve process. Default: '127.0.0.1'. */
  host?: string;
}
