export type FirstAidCategory = 'procedure' | 'technique';

export interface FirstAidEntry {
  id: string;
  title: string;
  category: FirstAidCategory;
  definition: string;
  description: string;
  signs_symptoms?: string[];
  process?: string;
  dos?: string;
  donts?: string;
  things_to_look_out_for?: string;
  implications?: string;
  indication?: string;
  contraindications?: string;
  images?: string[]; // legacy image urls
  media?: Array<{ id: string; media_type: 'image' | 'video'; url: string; provider?: string }>;
  tags?: string[];
  region_tags?: string[];
  system_tags?: string[];
  created_at?: string;
}
