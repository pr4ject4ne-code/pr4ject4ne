/**
 * Stage 1 of the homepage symptom search — the emergency red-flag gate.
 * See docs/triage-content-review.md for the clinical grounding and the
 * "review before launch" caveat.
 *
 * This gate is evaluated FIRST, always, before any specialty-routing logic
 * (symptom-specialty-map.ts) runs. If it fires, the caller must show the
 * "this may be an emergency" outcome and skip specialty-matching entirely —
 * never rank hospitals, never suggest a specialty. Modeled on the Manchester
 * Triage System's general discriminators (life threat, pain, haemorrhage,
 * conscious level, temperature, acuteness) and the standard 0-10 pain
 * ruler's severe-pain boundary (>=7).
 *
 * Deliberately a small, pure, independently-testable module (no React, no
 * fetch) — a hard safety boundary is easier to reason about and unit-test in
 * isolation than if it were folded into the UI component or the query
 * builder.
 */

export interface RedFlagSymptom {
  /** Stable key used in the UI/URL — never displayed directly. */
  id: string;
  /** User-facing label. */
  label: string;
}

/**
 * Selectable items that ARE themselves an emergency regardless of anything
 * else selected — picking any one of these should short-circuit straight to
 * the emergency outcome, no specialty-matching. Closed vocabulary; there is
 * no free-text equivalent by design (see the module-level comment in
 * symptom-specialty-map.ts for why this is a hard requirement, not style).
 */
export const RED_FLAG_SYMPTOMS: RedFlagSymptom[] = [
  { id: 'not-breathing', label: 'Not breathing, gasping, or choking' },
  { id: 'unresponsive', label: "Unresponsive or can't be roused" },
  { id: 'seizure-ongoing', label: 'A seizure is happening right now, or repeated seizures' },
  { id: 'uncontrolled-bleeding', label: 'Uncontrolled or spurting bleeding' },
  {
    id: 'severe-allergic-reaction',
    label: 'Severe allergic reaction (swelling of lips/tongue/throat, trouble breathing)',
  },
  {
    id: 'stroke-signs',
    label: 'Sudden face droop, arm weakness, or slurred speech (possible stroke)',
  },
  {
    id: 'chest-pain',
    label: 'Chest pain or pressure, especially with sweating, nausea, or breathlessness',
  },
  { id: 'poisoning-overdose', label: 'Suspected poisoning or overdose' },
  { id: 'suicidal-crisis', label: 'Active thoughts of suicide with a plan, or self-harm in progress' },
  {
    id: 'major-trauma',
    label: "Major injury, an open fracture, or a limb that's pale, cold, or numb",
  },
  { id: 'breathless-at-rest', label: "Struggling to breathe even at rest / can't speak full sentences" },
  { id: 'new-confusion', label: 'New confusion, drowsiness, or fading consciousness' },
  { id: 'sudden-vision-loss', label: 'Sudden loss of vision or sudden severe eye pain' },
  { id: 'worst-headache', label: 'Sudden, "worst headache of my life"' },
  { id: 'pregnancy-bleeding', label: 'Bleeding in pregnancy, or pregnancy with abdominal pain' },
  { id: 'cannot-urinate', label: 'Completely unable to pass urine, or sudden severe testicular pain' },
  { id: 'vomiting-blood', label: 'Vomiting blood, or black tarry stools' },
];

const RED_FLAG_IDS = new Set(RED_FLAG_SYMPTOMS.map((s) => s.id));

export function isRedFlagSymptomId(value: unknown): value is string {
  return typeof value === 'string' && RED_FLAG_IDS.has(value);
}

/** Keep only whitelisted red-flag ids, de-duplicated. */
export function normalizeRedFlagIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (isRedFlagSymptomId(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/** 0-10 self-reported severity/pain scale (the founder's literal ask —
 * a slider the user sets themselves, never an inferred value). */
export const MIN_SEVERITY = 0;
export const MAX_SEVERITY = 10;

/** Standard Manchester-Triage-style pain-discriminator boundary. */
export const SEVERITY_EMERGENCY_THRESHOLD = 7;

export function isValidSeverity(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_SEVERITY &&
    value <= MAX_SEVERITY
  );
}

export type RedFlagReason = 'red-flag-symptom' | 'high-severity' | null;

export interface RedFlagGateInput {
  /** Ids from RED_FLAG_SYMPTOMS the user selected (unrecognised ids are ignored). */
  selectedRedFlagIds?: string[] | null;
  /** 0-10 self-reported severity; null/undefined means "not set". */
  severity?: number | null;
}

export interface RedFlagGateResult {
  isEmergency: boolean;
  reason: RedFlagReason;
}

/**
 * Pure Stage-1 gate. Any recognised red-flag symptom OR severity >= 7 fires
 * it — evaluated with OR logic, first match wins (red-flag symptom checked
 * first since it's unconditionally true regardless of the slider position).
 * Never returns anything about specialty routing; the caller must treat
 * `isEmergency: true` as a hard stop before Stage 2 runs at all.
 */
export function evaluateRedFlagGate(input: RedFlagGateInput): RedFlagGateResult {
  const selected = normalizeRedFlagIds(input.selectedRedFlagIds ?? []);
  if (selected.length > 0) {
    return { isEmergency: true, reason: 'red-flag-symptom' };
  }
  if (isValidSeverity(input.severity) && input.severity >= SEVERITY_EMERGENCY_THRESHOLD) {
    return { isEmergency: true, reason: 'high-severity' };
  }
  return { isEmergency: false, reason: null };
}
