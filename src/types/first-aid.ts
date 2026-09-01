export type FirstAidCategory = 'procedure' | 'technique';

export interface FirstAidEntry {
  id: string;
  title: string;
  category: FirstAidCategory;
  definition: string | null;
  description: string | null;
  signs_symptoms?: string[];
  process: string | null;
  dos: string | null;
  donts: string | null;
  things_to_look_out_for: string | null;
  implications: string | null;
  indication: string | null;
  contraindications: string | null;
  images?: string[]; // legacy image urls
  media?: Array<{ id: string; media_type: 'image' | 'video'; url: string; provider?: string }>;
  tags?: string[];
  region_tags?: string[];
  system_tags?: string[];
  created_at?: string;
}
