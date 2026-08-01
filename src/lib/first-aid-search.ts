import type { FirstAidCategory } from '@/types';

export interface FirstAidQuery {
  category?: FirstAidCategory | '';
  tag?: string;
  region?: string;
  system?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function buildFirstAidQuery(params: FirstAidQuery): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set('category', params.category);
  if (params.tag) sp.set('tag', params.tag);
  if (params.region) sp.set('region', params.region);
  if (params.system) sp.set('system', params.system);
  if (params.q) sp.set('q', params.q);
  sp.set('limit', String(params.limit ?? 12));
  sp.set('offset', String(params.offset ?? 0));
  return sp.toString();
}

export const FIRST_AID_DISCLAIMER =
  'This is educational reference only and should not replace professional medical advice. ' +
  'Always consult a qualified healthcare provider and back-check any guidance. ' +
  'This guidance is not provided under law.';
