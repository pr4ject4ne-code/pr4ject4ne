import type { BiodataLayer, ProfileLayer, ClinicalCondition } from '@/types';

/**
 * Turns an already-filtered (via `filterBiodataBySharingPrefs`) biodata read
 * into an ordered list of document sections — the "organized document form"
 * worklist #24 asks for, rather than a raw JSON dump. Pure/testable: takes
 * only the two partial layers, no fetching, no DOM.
 *
 * Section order matches SHARING_PREF_KEYS / the item text's own list: Profile,
 * Demographics, Anthropometrics, Chronic disease, Genotype, Blood group,
 * Disability, Health preferences, Clinical conditions. A section is omitted
 * entirely when it has no rows (nothing opted in / nothing filled) rather
 * than rendered empty — mirrors the #33 first-aid-detail "only show a section
 * if it has content" pattern.
 */

export interface DocumentRow {
  label: string;
  value: string;
}

export interface DocumentSection {
  key: string;
  title: string;
  rows: DocumentRow[];
}

const PROFILE_LABELS: Partial<Record<keyof ProfileLayer, string>> = {
  full_name: 'Full name',
  alias: 'Alias',
  gender: 'Gender',
  phone: 'Phone',
  email: 'Email',
  dob: 'Date of birth',
  next_of_kin: 'Next of kin',
  address: 'Address',
};

const DEMOGRAPHIC_LABELS: Partial<Record<keyof BiodataLayer, string>> = {
  occupation: 'Occupation',
  marital_status: 'Marital status',
  religious_status: 'Religious status',
  tribe: 'Tribe',
  ethnicity: 'Ethnicity',
};

const ANTHROPOMETRIC_LABELS: Partial<Record<keyof BiodataLayer, string>> = {
  height_cm: 'Height (cm)',
  weight_kg: 'Weight (kg)',
  waist_cm: 'Waist circumference (cm)',
  chest_cm: 'Chest circumference (cm)',
  hip_cm: 'Hip circumference (cm)',
  bmi: 'BMI',
};

function rowsFrom<T extends object>(layer: T, labels: Partial<Record<keyof T, string>>): DocumentRow[] {
  const rows: DocumentRow[] = [];
  for (const key of Object.keys(labels) as (keyof T)[]) {
    const value = layer[key];
    if (value === undefined || value === null || value === '') continue;
    rows.push({ label: labels[key] as string, value: String(value) });
  }
  return rows;
}

function clinicalConditionRows(conditions: ClinicalCondition[]): DocumentRow[] {
  return conditions.map((c, i) => {
    const parts = [
      c.duration && `duration: ${c.duration}`,
      c.progression && `progression: ${c.progression}`,
      c.complication && `complication: ${c.complication}`,
      c.care && `care: ${c.care}`,
      c.cause && `cause: ${c.cause}`,
      c.timestamp && `recorded: ${new Date(c.timestamp).toLocaleDateString()}`,
    ].filter(Boolean);
    return {
      label: conditions.length > 1 ? `Condition ${i + 1}` : 'Condition',
      value: parts.length > 0 ? `${c.condition} (${parts.join(', ')})` : c.condition,
    };
  });
}

export function buildBiodataDocument(
  profileLayer: Partial<ProfileLayer>,
  biodataLayer: Partial<BiodataLayer>,
): DocumentSection[] {
  const sections: DocumentSection[] = [];

  const profileRows = rowsFrom(profileLayer, PROFILE_LABELS);
  if (profileRows.length > 0) sections.push({ key: 'profile', title: 'Profile', rows: profileRows });

  const demographicRows = rowsFrom(biodataLayer, DEMOGRAPHIC_LABELS);
  if (demographicRows.length > 0) sections.push({ key: 'demographics', title: 'Demographics', rows: demographicRows });

  const anthropometricRows = rowsFrom(biodataLayer, ANTHROPOMETRIC_LABELS);
  if (anthropometricRows.length > 0) {
    sections.push({ key: 'anthropometrics', title: 'Anthropometrics', rows: anthropometricRows });
  }

  if (biodataLayer.chronic_disease) {
    sections.push({
      key: 'chronic_disease',
      title: 'Chronic disease',
      rows: [{ label: 'Chronic disease', value: biodataLayer.chronic_disease }],
    });
  }

  if (biodataLayer.genotype) {
    sections.push({ key: 'genotype', title: 'Genotype', rows: [{ label: 'Genotype', value: biodataLayer.genotype }] });
  }

  if (biodataLayer.blood_group) {
    sections.push({
      key: 'blood_group',
      title: 'Blood group',
      rows: [{ label: 'Blood group', value: biodataLayer.blood_group }],
    });
  }

  if (biodataLayer.disability) {
    sections.push({
      key: 'disability',
      title: 'Disability',
      rows: [{ label: 'Disability', value: biodataLayer.disability }],
    });
  }

  if (biodataLayer.health_preferences) {
    sections.push({
      key: 'health_preferences',
      title: 'Health preferences',
      rows: [{ label: 'Health preferences', value: biodataLayer.health_preferences }],
    });
  }

  if (biodataLayer.clinical_conditions && biodataLayer.clinical_conditions.length > 0) {
    sections.push({
      key: 'clinical_conditions',
      title: 'Clinical conditions',
      rows: clinicalConditionRows(biodataLayer.clinical_conditions),
    });
  }

  return sections;
}
