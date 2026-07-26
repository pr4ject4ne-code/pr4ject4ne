import {
  RED_FLAG_SYMPTOMS,
  SEVERITY_EMERGENCY_THRESHOLD,
  evaluateRedFlagGate,
  isRedFlagSymptomId,
  isValidSeverity,
  normalizeRedFlagIds,
} from '@/lib/symptom-red-flags';

describe('symptom-red-flags gate (Stage 1)', () => {
  it('any red-flag symptom selected fires the gate, regardless of other selections/severity', () => {
    const result = evaluateRedFlagGate({
      selectedRedFlagIds: ['chest-pain'],
      severity: 0,
    });
    expect(result.isEmergency).toBe(true);
    expect(result.reason).toBe('red-flag-symptom');
  });

  it('a red flag fires even alongside other (unrelated) selections', () => {
    const result = evaluateRedFlagGate({
      selectedRedFlagIds: ['not-a-real-id', 'stroke-signs'],
      severity: null,
    });
    expect(result.isEmergency).toBe(true);
    expect(result.reason).toBe('red-flag-symptom');
  });

  it(`severity >= ${SEVERITY_EMERGENCY_THRESHOLD} fires the gate even with no red-flag symptom selected`, () => {
    const result = evaluateRedFlagGate({
      selectedRedFlagIds: [],
      severity: SEVERITY_EMERGENCY_THRESHOLD,
    });
    expect(result.isEmergency).toBe(true);
    expect(result.reason).toBe('high-severity');

    const above = evaluateRedFlagGate({ selectedRedFlagIds: [], severity: 10 });
    expect(above.isEmergency).toBe(true);
  });

  it(`severity below ${SEVERITY_EMERGENCY_THRESHOLD} and no red flags proceeds to normal routing (not an emergency)`, () => {
    const result = evaluateRedFlagGate({
      selectedRedFlagIds: [],
      severity: SEVERITY_EMERGENCY_THRESHOLD - 1,
    });
    expect(result.isEmergency).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('no red flags and no severity set is not an emergency', () => {
    const result = evaluateRedFlagGate({ selectedRedFlagIds: [], severity: null });
    expect(result.isEmergency).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('ignores unrecognised red-flag ids (does not fire the gate on garbage input alone)', () => {
    const result = evaluateRedFlagGate({
      selectedRedFlagIds: ['not-a-real-id'],
      severity: 0,
    });
    expect(result.isEmergency).toBe(false);
  });

  it('treats an out-of-range severity as unset rather than erroring', () => {
    expect(evaluateRedFlagGate({ selectedRedFlagIds: [], severity: 999 }).isEmergency).toBe(false);
    expect(evaluateRedFlagGate({ selectedRedFlagIds: [], severity: -1 }).isEmergency).toBe(false);
    expect(evaluateRedFlagGate({ selectedRedFlagIds: [], severity: NaN }).isEmergency).toBe(false);
  });
});

describe('RED_FLAG_SYMPTOMS whitelist', () => {
  it('is non-empty and every entry has a stable id and label', () => {
    expect(RED_FLAG_SYMPTOMS.length).toBeGreaterThan(0);
    for (const s of RED_FLAG_SYMPTOMS) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.label).toBe('string');
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = RED_FLAG_SYMPTOMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isRedFlagSymptomId', () => {
  it('accepts a whitelisted id and rejects anything else', () => {
    expect(isRedFlagSymptomId('chest-pain')).toBe(true);
    expect(isRedFlagSymptomId('not-real')).toBe(false);
    expect(isRedFlagSymptomId(42)).toBe(false);
    expect(isRedFlagSymptomId(null)).toBe(false);
  });
});

describe('normalizeRedFlagIds', () => {
  it('keeps only whitelisted ids, de-duplicated', () => {
    expect(normalizeRedFlagIds(['chest-pain', 'not-real', 'chest-pain', 'stroke-signs'])).toEqual([
      'chest-pain',
      'stroke-signs',
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeRedFlagIds('chest-pain')).toEqual([]);
    expect(normalizeRedFlagIds(undefined)).toEqual([]);
    expect(normalizeRedFlagIds(null)).toEqual([]);
  });
});

describe('isValidSeverity', () => {
  it('accepts integers 0-10 inclusive', () => {
    expect(isValidSeverity(0)).toBe(true);
    expect(isValidSeverity(10)).toBe(true);
    expect(isValidSeverity(7)).toBe(true);
  });

  it('rejects out-of-range, non-finite, or non-number values', () => {
    expect(isValidSeverity(-1)).toBe(false);
    expect(isValidSeverity(11)).toBe(false);
    expect(isValidSeverity(NaN)).toBe(false);
    expect(isValidSeverity('7')).toBe(false);
    expect(isValidSeverity(null)).toBe(false);
    expect(isValidSeverity(undefined)).toBe(false);
  });
});
