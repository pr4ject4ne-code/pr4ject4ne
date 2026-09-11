/**
 * Emergency telephone numbers by country — for the country-selector tab
 * (item 3), and to keep the symptom-search flow from hardcoding Nigeria's
 * 112 for a global audience.
 *
 * Deliberately NOT exhaustive and NOT broken down into separate
 * police/ambulance/fire lines for every country: getting that level of
 * detail right for 190+ countries from secondary sources is a real accuracy
 * risk for safety-critical data. Instead this lists the general/mobile-
 * reachable emergency number for ~70 countries with broad global coverage,
 * sourced from https://en.wikipedia.org/wiki/List_of_emergency_telephone_numbers
 * (checked 2026-09) plus well-established standards (112/EU, 911/NA, 999/UK
 * lineage, 000/AU, 111/NZ). Where a country has no single unified number,
 * the most useful one or two are listed with a label.
 *
 * If you're extending this list, prefer a primary source (that country's
 * own telecom/police authority) over a blog aggregator, and keep the
 * disclaimer in EmergencyNumbers.tsx — it exists because this list can't be
 * guaranteed complete or current for every country.
 */

export interface CountryEmergencyNumber {
  /** ISO 3166-1 alpha-2, used as the <select> value/key. */
  code: string;
  country: string;
  /** e.g. "112" or "999 (police) / 995 (ambulance & fire)". */
  number: string;
}

export const EMERGENCY_NUMBERS: CountryEmergencyNumber[] = [
  // Africa
  { code: 'NG', country: 'Nigeria', number: '112' },
  { code: 'GH', country: 'Ghana', number: '112' },
  { code: 'KE', country: 'Kenya', number: '999 (or 112 on mobile)' },
  { code: 'ZA', country: 'South Africa', number: '112 (mobile) / 10111 (police landline)' },
  { code: 'EG', country: 'Egypt', number: '122 (police) / 123 (ambulance)' },
  { code: 'UG', country: 'Uganda', number: '112' },
  { code: 'TZ', country: 'Tanzania', number: '112' },
  { code: 'RW', country: 'Rwanda', number: '112' },
  { code: 'ZM', country: 'Zambia', number: '999 (or 112 on mobile)' },
  { code: 'ZW', country: 'Zimbabwe', number: '999 (or 112 on mobile)' },
  { code: 'SN', country: 'Senegal', number: '17 (police) / 18 (fire)' },
  { code: 'BJ', country: 'Benin', number: '117 (police) / 112 (ambulance)' },
  { code: 'TG', country: 'Togo', number: '117 (police)' },
  { code: 'MA', country: 'Morocco', number: '19 (police) / 15 (ambulance)' },
  { code: 'DZ', country: 'Algeria', number: '17 (police) / 14 (fire & ambulance)' },
  { code: 'TN', country: 'Tunisia', number: '197 (police) / 190 (ambulance)' },
  { code: 'SD', country: 'Sudan', number: '999' },
  { code: 'AO', country: 'Angola', number: '113 (police) / 115 (fire)' },
  { code: 'BW', country: 'Botswana', number: '999 (police) / 997 (ambulance)' },
  { code: 'SL', country: 'Sierra Leone', number: '999' },
  { code: 'LR', country: 'Liberia', number: '911' },

  // Europe (112 is the EU-wide standard; UK/Ireland also keep 999)
  { code: 'GB', country: 'United Kingdom', number: '999 or 112' },
  { code: 'IE', country: 'Ireland', number: '112 or 999' },
  { code: 'FR', country: 'France', number: '112' },
  { code: 'DE', country: 'Germany', number: '112' },
  { code: 'ES', country: 'Spain', number: '112' },
  { code: 'IT', country: 'Italy', number: '112' },
  { code: 'PT', country: 'Portugal', number: '112' },
  { code: 'NL', country: 'Netherlands', number: '112' },
  { code: 'BE', country: 'Belgium', number: '112' },
  { code: 'CH', country: 'Switzerland', number: '112 (or 117 police / 144 ambulance)' },
  { code: 'AT', country: 'Austria', number: '112' },
  { code: 'SE', country: 'Sweden', number: '112' },
  { code: 'NO', country: 'Norway', number: '112 (police) / 113 (ambulance)' },
  { code: 'DK', country: 'Denmark', number: '112' },
  { code: 'FI', country: 'Finland', number: '112' },
  { code: 'PL', country: 'Poland', number: '112' },
  { code: 'CZ', country: 'Czechia', number: '112' },
  { code: 'GR', country: 'Greece', number: '112' },
  { code: 'TR', country: 'Türkiye', number: '112' },
  { code: 'RU', country: 'Russia', number: '112' },
  { code: 'UA', country: 'Ukraine', number: '112' },
  { code: 'RO', country: 'Romania', number: '112' },
  { code: 'HU', country: 'Hungary', number: '112' },
  { code: 'IS', country: 'Iceland', number: '112' },

  // Americas (911 is near-universal, but not everywhere)
  { code: 'US', country: 'United States', number: '911' },
  { code: 'CA', country: 'Canada', number: '911' },
  { code: 'MX', country: 'Mexico', number: '911' },
  { code: 'GT', country: 'Guatemala', number: '110 or 123' },
  { code: 'BZ', country: 'Belize', number: '911' },
  { code: 'HN', country: 'Honduras', number: '911' },
  { code: 'SV', country: 'El Salvador', number: '911' },
  { code: 'NI', country: 'Nicaragua', number: '911' },
  { code: 'CR', country: 'Costa Rica', number: '911' },
  { code: 'PA', country: 'Panama', number: '911' },
  { code: 'CO', country: 'Colombia', number: '123' },
  { code: 'VE', country: 'Venezuela', number: '911' },
  { code: 'EC', country: 'Ecuador', number: '911' },
  { code: 'PE', country: 'Peru', number: '105 (police) / 911' },
  { code: 'BR', country: 'Brazil', number: '190 (police) / 192 (ambulance) / 193 (fire)' },
  { code: 'BO', country: 'Bolivia', number: '911' },
  { code: 'PY', country: 'Paraguay', number: '911' },
  { code: 'UY', country: 'Uruguay', number: '911' },
  { code: 'CL', country: 'Chile', number: '133 (police) / 131 (ambulance)' },
  { code: 'AR', country: 'Argentina', number: '911' },
  { code: 'CU', country: 'Cuba', number: '106 (police) / 104 (ambulance)' },
  { code: 'DO', country: 'Dominican Republic', number: '911' },
  { code: 'JM', country: 'Jamaica', number: '119 (police) / 110 (ambulance & fire)' },
  { code: 'TT', country: 'Trinidad and Tobago', number: '999 (police) / 811 (ambulance)' },

  // Middle East
  { code: 'AE', country: 'United Arab Emirates', number: '999 (police, or 112 on mobile)' },
  { code: 'SA', country: 'Saudi Arabia', number: '999 (police) / 997 (ambulance)' },
  { code: 'IL', country: 'Israel', number: '100 (police) / 101 (ambulance)' },
  { code: 'QA', country: 'Qatar', number: '999' },
  { code: 'KW', country: 'Kuwait', number: '112' },
  { code: 'JO', country: 'Jordan', number: '911 (police) / 199 (civil defense)' },
  { code: 'LB', country: 'Lebanon', number: '112 (police) / 140 (ambulance)' },

  // Asia
  { code: 'IN', country: 'India', number: '112' },
  { code: 'PK', country: 'Pakistan', number: '15 (police) / 1122 (rescue)' },
  { code: 'CN', country: 'China', number: '110 (police) / 120 (ambulance) / 119 (fire)' },
  { code: 'JP', country: 'Japan', number: '110 (police) / 119 (ambulance & fire)' },
  { code: 'KR', country: 'South Korea', number: '112 (police) / 119 (fire & ambulance)' },
  { code: 'HK', country: 'Hong Kong', number: '999' },
  { code: 'TW', country: 'Taiwan', number: '110 (police) / 119 (fire & ambulance)' },
  { code: 'SG', country: 'Singapore', number: '999 (police) / 995 (ambulance & fire)' },
  { code: 'MY', country: 'Malaysia', number: '999' },
  { code: 'ID', country: 'Indonesia', number: '112' },
  { code: 'TH', country: 'Thailand', number: '191 (police) / 1669 (ambulance)' },
  { code: 'VN', country: 'Vietnam', number: '113 (police) / 115 (ambulance) / 114 (fire)' },
  { code: 'PH', country: 'Philippines', number: '911' },
  { code: 'BD', country: 'Bangladesh', number: '999' },
  { code: 'LK', country: 'Sri Lanka', number: '119' },
  { code: 'NP', country: 'Nepal', number: '100 (police)' },

  // Oceania
  { code: 'AU', country: 'Australia', number: '000 (or 112 on mobile)' },
  { code: 'NZ', country: 'New Zealand', number: '111' },
  { code: 'FJ', country: 'Fiji', number: '911 (fire & ambulance) / 917 (police)' },
].sort((a, b) => a.country.localeCompare(b.country));
