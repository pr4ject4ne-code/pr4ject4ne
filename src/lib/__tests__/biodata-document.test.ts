import { buildBiodataDocument } from '@/lib/biodata-document';

describe('buildBiodataDocument', () => {
  it('returns no sections when nothing is present', () => {
    expect(buildBiodataDocument({}, {})).toEqual([]);
  });

  it('omits a section entirely when it has no rows, rather than rendering it empty', () => {
    const sections = buildBiodataDocument({ full_name: 'Ada' }, {});
    expect(sections).toHaveLength(1);
    expect(sections[0]!.key).toBe('profile');
  });

  it('groups profile fields under one Profile section', () => {
    const sections = buildBiodataDocument(
      { full_name: 'Ada', phone: '0800', email: 'a@b.com' },
      {},
    );
    const profile = sections.find((s) => s.key === 'profile');
    expect(profile?.rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Full name', 'Phone', 'Email']),
    );
  });

  it('groups demographics and anthropometrics into their own sections', () => {
    const sections = buildBiodataDocument(
      {},
      { occupation: 'Engineer', height_cm: 180, weight_kg: 70 },
    );
    expect(sections.find((s) => s.key === 'demographics')?.rows).toEqual([
      { label: 'Occupation', value: 'Engineer' },
    ]);
    const anthro = sections.find((s) => s.key === 'anthropometrics');
    expect(anthro?.rows).toEqual(
      expect.arrayContaining([
        { label: 'Height (cm)', value: '180' },
        { label: 'Weight (kg)', value: '70' },
      ]),
    );
  });

  it('single-value sections (chronic disease, genotype, blood group, disability, health preferences)', () => {
    const sections = buildBiodataDocument(
      {},
      {
        chronic_disease: 'Asthma',
        genotype: 'AA',
        blood_group: 'O+',
        disability: 'None',
        health_preferences: 'Prefers a female doctor',
      },
    );
    expect(sections.find((s) => s.key === 'chronic_disease')?.rows[0]!.value).toBe('Asthma');
    expect(sections.find((s) => s.key === 'genotype')?.rows[0]!.value).toBe('AA');
    expect(sections.find((s) => s.key === 'blood_group')?.rows[0]!.value).toBe('O+');
    expect(sections.find((s) => s.key === 'disability')?.rows[0]!.value).toBe('None');
    expect(sections.find((s) => s.key === 'health_preferences')?.rows[0]!.value).toBe(
      'Prefers a female doctor',
    );
  });

  it('renders clinical conditions with their sub-fields folded into the value', () => {
    const sections = buildBiodataDocument(
      {},
      {
        clinical_conditions: [
          { condition: 'Hypertension', cause: 'Family history', timestamp: '2026-01-01T00:00:00Z' },
        ],
      },
    );
    const cc = sections.find((s) => s.key === 'clinical_conditions');
    expect(cc?.rows[0]!.label).toBe('Condition');
    expect(cc?.rows[0]!.value).toContain('Hypertension');
    expect(cc?.rows[0]!.value).toContain('cause: Family history');
  });

  it('numbers multiple clinical conditions', () => {
    const sections = buildBiodataDocument(
      {},
      {
        clinical_conditions: [{ condition: 'Asthma' }, { condition: 'Hypertension' }],
      },
    );
    const cc = sections.find((s) => s.key === 'clinical_conditions');
    expect(cc?.rows.map((r) => r.label)).toEqual(['Condition 1', 'Condition 2']);
  });

  it('maintains a fixed section order regardless of layer key order', () => {
    const sections = buildBiodataDocument(
      { full_name: 'Ada' },
      { blood_group: 'O+', genotype: 'AA', chronic_disease: 'Asthma', occupation: 'Engineer' },
    );
    expect(sections.map((s) => s.key)).toEqual([
      'profile',
      'demographics',
      'chronic_disease',
      'genotype',
      'blood_group',
    ]);
  });
});
