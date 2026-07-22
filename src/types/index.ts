// Shared domain types for Racoon Eye.

export type AccountType = 'patient' | 'hospital_staff' | 'developer';
/**
 * Developer access levels (the three-level dev/admin model):
 *  - primary   (executive)  — manages all levels, creates secondaries
 *  - secondary (operational) — creates tertiaries, edits First Aid, monitors
 * Tertiary is not an access_level — it is the `hospital_staff` account_type.
 */
export type AccessLevel = 'primary' | 'secondary';
export type ServiceType = 'hospital' | 'clinic' | 'pharmacy' | 'radiology' | 'other';
export type AnnouncementColor = 'green' | 'yellow' | 'red';
export type FirstAidCategory = 'procedure' | 'technique';
export type SuggestionCategory = 'data_correction' | 'photo' | 'hours' | 'personnel' | 'other';
export type SuggestionStatus = 'new' | 'reviewed' | 'applied' | 'dismissed';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  account_type: AccountType;
  hospital_id: string | null;
  verified: boolean;
  access_level: string | null;
  is_active: boolean;
  created_by: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

/** User shape safe to return to clients (no password hash). */
export type PublicUser = Omit<User, 'password_hash'>;

export interface HospitalPhoto {
  url: string;
  caption?: string;
  slot?: 'outside_far' | 'outside_close' | 'reception' | 'other';
}

/**
 * A department groups related services under a name the institution chooses
 * itself (e.g. "Surgery" -> ["General Surgery", "Orthopaedics"]). `services`
 * is deliberately free-form/flat — "subclassed as they see fit" without a
 * fixed taxonomy (worklist #14).
 */
export interface HospitalDepartment {
  name: string;
  services: string[];
}

export interface Hospital {
  id: string;
  name: string;
  service_type: ServiceType;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  logo_url: string | null;
  photos: HospitalPhoto[];
  hours: Record<string, string>;
  specialties: string[];
  departments: HospitalDepartment[];
  rating_avg: number;
  rating_count: number;
  is_24_hour: boolean;
  show_doctors: boolean;
  verified: boolean;
  account_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  hospital_id: string;
  title: string;
  body: string | null;
  color: AnnouncementColor;
  event_date: string | null;
  is_bar: boolean;
  created_at: string;
  updated_at: string;
}

export interface Doctor {
  id: string;
  hospital_id: string;
  name: string;
  specialty: string | null;
  level: string | null;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

/** Profile layer — freely visible (except DOB, gated by dob_visible). */
export interface ProfileLayer {
  full_name?: string;
  alias?: string;
  gender?: string;
  phone?: string;
  email?: string;
  dob?: string;
  dob_visible?: boolean;
  next_of_kin?: string;
  address?: string;
  profile_photo_url?: string;
}

export interface ClinicalCondition {
  condition: string;
  cause?: string;
  duration?: string;
  progression?: string;
  complication?: string;
  care?: string;
  timestamp?: string;
}

/** Biodata layer — locked behind the IHN code. */
export interface BiodataLayer {
  chronic_disease?: string;
  occupation?: string;
  marital_status?: string;
  religious_status?: string;
  tribe?: string;
  ethnicity?: string;
  height_cm?: number;
  weight_kg?: number;
  waist_cm?: number;
  chest_cm?: number;
  hip_cm?: number;
  /** Derived from height + weight server-side; never client-authoritative. */
  bmi?: number;
  genotype?: string;
  blood_group?: string;
  clinical_conditions?: ClinicalCondition[];
  disability?: string;
  health_preferences?: string;
}

export interface Biodata {
  user_id: string;
  profile_layer: ProfileLayer;
  biodata_layer: BiodataLayer;
  ihn_code: string;
  last_modified_at: string;
  created_at: string;
}

export interface FirstAidEntry {
  id: string;
  category: FirstAidCategory;
  title: string;
  definition: string | null;
  description: string | null;
  process: string | null;
  dos: string | null;
  donts: string | null;
  things_to_look_out_for: string | null;
  implications: string | null;
  indication: string | null;
  contraindications: string | null;
  images: string[];
  tags: string[];
  created_by_dev_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Suggestion {
  id: string;
  hospital_id: string | null;
  submitted_by_email: string | null;
  content: string;
  category: SuggestionCategory;
  status: SuggestionStatus;
  applied_to_field: string | null;
  reviewed_by_dev_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

/** Standard error response shape for all API routes. */
export interface ApiError {
  error: string;
  code: string;
}
