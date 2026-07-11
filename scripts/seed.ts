/**
 * Development seed data for Racoon Eye.
 *
 * Populates a handful of real Enugu health facilities (with coordinates so the
 * map pins render), a doctor roster, a few dated announcements, and a starter
 * First Aid catalog. All rows use fixed UUIDs and `ON CONFLICT DO UPDATE`, so
 * this script is idempotent — safe to run repeatedly.
 *
 * These are seeded as community-managed listings (account_id NULL, verified
 * FALSE) — draft directory data, not verified institutional accounts.
 *
 * Usage: npm run db:seed
 */
import { Pool } from 'pg';

type Hospital = {
  id: string;
  name: string;
  service_type: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  website: string | null;
  contact_phone: string | null;
  specialties: string[];
  is_24_hour: boolean;
};

// Approximate coordinates around Enugu; good enough to spread pins across the map.
const HOSPITALS: Hospital[] = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    name: 'National Orthopaedic Hospital, Enugu',
    service_type: 'hospital',
    address: 'Abakpa Nike, Enugu',
    city: 'Enugu',
    latitude: 6.4631,
    longitude: 7.5486,
    website: null,
    contact_phone: '+234 42 550 088',
    specialties: ['Orthopaedics', 'Trauma', 'Physiotherapy'],
    is_24_hour: true,
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    name: 'ESUT Teaching Hospital, Parklane',
    service_type: 'hospital',
    address: 'Park Lane, GRA, Enugu',
    city: 'Enugu',
    latitude: 6.4413,
    longitude: 7.4983,
    website: null,
    contact_phone: '+234 42 259 831',
    specialties: ['General Medicine', 'Paediatrics', 'Obstetrics & Gynaecology', 'Surgery'],
    is_24_hour: true,
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    name: 'Niger Foundation Hospital',
    service_type: 'hospital',
    address: 'Independence Layout, Enugu',
    city: 'Enugu',
    latitude: 6.4406,
    longitude: 7.5139,
    website: 'https://nigerfoundation.org',
    contact_phone: '+234 803 000 0000',
    specialties: ['Cardiology', 'Internal Medicine', 'Diagnostics'],
    is_24_hour: false,
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    name: 'Memfys Hospital for Neurosurgery',
    service_type: 'hospital',
    address: 'Enugu–Onitsha Expressway, Enugu',
    city: 'Enugu',
    latitude: 6.4256,
    longitude: 7.5361,
    website: 'https://memfyshospital.com',
    contact_phone: '+234 700 636 397',
    specialties: ['Neurosurgery', 'Radiology', 'Neurology'],
    is_24_hour: true,
  },
  {
    id: '11111111-1111-1111-1111-111111111105',
    name: 'Mother of Christ Specialist Hospital',
    service_type: 'hospital',
    address: 'Ogui Road, Enugu',
    city: 'Enugu',
    latitude: 6.4436,
    longitude: 7.5008,
    website: null,
    contact_phone: '+234 42 254 512',
    specialties: ['Obstetrics & Gynaecology', 'Paediatrics', 'General Medicine'],
    is_24_hour: true,
  },
  {
    id: '11111111-1111-1111-1111-111111111106',
    name: 'HealthPlus Pharmacy, Enugu',
    service_type: 'pharmacy',
    address: 'Zik Avenue, Uwani, Enugu',
    city: 'Enugu',
    latitude: 6.4319,
    longitude: 7.4922,
    website: null,
    contact_phone: '+234 809 111 2222',
    specialties: ['Retail Pharmacy', 'Prescriptions'],
    is_24_hour: false,
  },
];

const STANDARD_HOURS = {
  mon: '08:00-17:00',
  tue: '08:00-17:00',
  wed: '08:00-17:00',
  thu: '08:00-17:00',
  fri: '08:00-17:00',
  sat: '09:00-13:00',
  sun: 'closed',
};

type Doctor = {
  id: string;
  hospital_id: string;
  name: string;
  specialty: string;
  level: string;
};

const DOCTORS: Doctor[] = [
  {
    id: '22222222-2222-2222-2222-222222222201',
    hospital_id: '11111111-1111-1111-1111-111111111101',
    name: 'Dr. Chukwuemeka Okafor',
    specialty: 'Orthopaedic Surgery',
    level: 'consultant',
  },
  {
    id: '22222222-2222-2222-2222-222222222202',
    hospital_id: '11111111-1111-1111-1111-111111111101',
    name: 'Dr. Ngozi Eze',
    specialty: 'Physiotherapy',
    level: 'senior_registrar',
  },
  {
    id: '22222222-2222-2222-2222-222222222203',
    hospital_id: '11111111-1111-1111-1111-111111111102',
    name: 'Dr. Ada Nwankwo',
    specialty: 'Paediatrics',
    level: 'consultant',
  },
  {
    id: '22222222-2222-2222-2222-222222222204',
    hospital_id: '11111111-1111-1111-1111-111111111104',
    name: 'Dr. Ifeanyi Obi',
    specialty: 'Neurosurgery',
    level: 'consultant',
  },
];

type Announcement = {
  id: string;
  hospital_id: string;
  title: string;
  body: string;
  color: 'green' | 'yellow' | 'red';
  event_date: string;
  is_bar: boolean;
};

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: '33333333-3333-3333-3333-333333333301',
    hospital_id: '11111111-1111-1111-1111-111111111101',
    title: 'Free orthopaedic screening this Saturday',
    body: 'Walk-in bone and joint assessments, 9am–1pm. No appointment needed.',
    color: 'green',
    event_date: '2026-07-18',
    is_bar: true,
  },
  {
    id: '33333333-3333-3333-3333-333333333302',
    hospital_id: '11111111-1111-1111-1111-111111111102',
    title: 'Paediatric ward at high capacity',
    body: 'Expect longer wait times for non-urgent paediatric visits this week.',
    color: 'yellow',
    event_date: '2026-07-12',
    is_bar: true,
  },
  {
    id: '33333333-3333-3333-3333-333333333303',
    hospital_id: '11111111-1111-1111-1111-111111111104',
    title: 'Emergency neurosurgery only — Jul 13',
    body: 'Elective procedures rescheduled. Emergencies unaffected.',
    color: 'red',
    event_date: '2026-07-13',
    is_bar: false,
  },
];

type FirstAid = {
  id: string;
  category: 'procedure' | 'technique';
  title: string;
  definition: string;
  description: string;
  process: string;
  dos: string;
  donts: string;
  things_to_look_out_for: string;
  implications: string;
  indication: string;
  contraindications: string;
};

const FIRST_AID: FirstAid[] = [
  {
    id: '44444444-4444-4444-4444-444444444401',
    category: 'technique',
    title: 'Cardiopulmonary Resuscitation (CPR)',
    definition:
      'An emergency technique that manually maintains blood flow and breathing when the heart stops.',
    description:
      'CPR combines chest compressions with rescue breaths to keep oxygenated blood moving to the brain and vital organs until professional help arrives.',
    process:
      '1. Check responsiveness and call for help.\n2. Place heel of hand on the centre of the chest.\n3. Compress hard and fast, ~100–120/min, 5–6cm deep.\n4. After 30 compressions, give 2 rescue breaths if trained.\n5. Continue until help arrives or the person recovers.',
    dos: 'Push hard and fast on the centre of the chest. Minimise interruptions. Rotate rescuers if tired.',
    donts: 'Do not stop unless the person recovers, help takes over, or you are physically unable. Do not lean on the chest between compressions.',
    things_to_look_out_for:
      'Signs of recovery: breathing, movement, coughing. Vomiting — turn the person on their side and clear the airway.',
    implications:
      'Rib fractures can occur and are acceptable relative to the alternative. Early CPR significantly improves survival.',
    indication: 'Unresponsive person who is not breathing normally.',
    contraindications:
      'A conscious, breathing person. Obvious signs of irreversible death. A valid Do-Not-Resuscitate order.',
  },
  {
    id: '44444444-4444-4444-4444-444444444402',
    category: 'procedure',
    title: 'Controlling Severe Bleeding',
    definition: 'First-aid steps to stop or slow heavy external blood loss.',
    description:
      'Rapid, firm, sustained pressure on a wound is the single most effective way to control severe bleeding before professional care.',
    process:
      '1. Apply firm direct pressure with a clean cloth or dressing.\n2. Keep pressure continuous — do not lift to check.\n3. If blood soaks through, add more dressing on top.\n4. Raise the injured limb if no fracture is suspected.\n5. Seek emergency care immediately.',
    dos: 'Apply firm, continuous pressure. Use gloves or a barrier if available. Keep the person calm and warm.',
    donts: 'Do not remove a soaked dressing. Do not apply a tourniquet unless trained and bleeding is life-threatening.',
    things_to_look_out_for:
      'Signs of shock: pale, cold, clammy skin, rapid breathing, confusion. Bleeding that will not slow with pressure.',
    implications: 'Uncontrolled severe bleeding can be fatal within minutes; prompt pressure saves lives.',
    indication: 'Heavy, continuous, or spurting external bleeding.',
    contraindications:
      'Do not apply direct pressure onto an embedded object — press around it instead.',
  },
  {
    id: '44444444-4444-4444-4444-444444444403',
    category: 'technique',
    title: 'Recovery Position',
    definition:
      'A stable side-lying position that keeps the airway of an unconscious, breathing person open.',
    description:
      'Placing an unconscious but breathing person on their side prevents the tongue blocking the airway and lets fluids drain from the mouth.',
    process:
      '1. Kneel beside the person.\n2. Place the near arm at a right angle.\n3. Bring the far hand to the near cheek; bend the far knee.\n4. Roll them toward you onto their side.\n5. Tilt the head back to keep the airway open and monitor breathing.',
    dos: 'Monitor breathing continuously. Keep the airway open. Call for emergency help.',
    donts: 'Do not use if a spinal injury is suspected unless the airway is at risk. Do not leave the person unattended.',
    things_to_look_out_for: 'Any change or stop in breathing — begin CPR if breathing stops.',
    implications: 'Reduces the risk of choking and aspiration in an unconscious person.',
    indication: 'Unconscious person who is breathing normally.',
    contraindications: 'Suspected serious spinal injury (weigh against airway risk).',
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Configure .env.local first.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString });

  try {
    for (const h of HOSPITALS) {
      await pool.query(
        `INSERT INTO hospitals
           (id, name, service_type, address, city, latitude, longitude, website,
            contact_phone, hours, specialties, is_24_hour, verified, account_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, FALSE, NULL, 'approved')
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           service_type = EXCLUDED.service_type,
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           website = EXCLUDED.website,
           contact_phone = EXCLUDED.contact_phone,
           hours = EXCLUDED.hours,
           specialties = EXCLUDED.specialties,
           is_24_hour = EXCLUDED.is_24_hour,
           updated_at = now()`,
        [
          h.id,
          h.name,
          h.service_type,
          h.address,
          h.city,
          h.latitude,
          h.longitude,
          h.website,
          h.contact_phone,
          JSON.stringify(STANDARD_HOURS),
          h.specialties,
          h.is_24_hour,
        ],
      );
    }

    for (const d of DOCTORS) {
      await pool.query(
        `INSERT INTO doctors (id, hospital_id, name, specialty, level)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           specialty = EXCLUDED.specialty,
           level = EXCLUDED.level,
           updated_at = now()`,
        [d.id, d.hospital_id, d.name, d.specialty, d.level],
      );
    }

    for (const a of ANNOUNCEMENTS) {
      await pool.query(
        `INSERT INTO announcements (id, hospital_id, title, body, color, event_date, is_bar)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           color = EXCLUDED.color,
           event_date = EXCLUDED.event_date,
           is_bar = EXCLUDED.is_bar,
           updated_at = now()`,
        [a.id, a.hospital_id, a.title, a.body, a.color, a.event_date, a.is_bar],
      );
    }

    for (const f of FIRST_AID) {
      await pool.query(
        `INSERT INTO first_aid_entries
           (id, category, title, definition, description, process, dos, donts,
            things_to_look_out_for, implications, indication, contraindications)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           category = EXCLUDED.category,
           title = EXCLUDED.title,
           definition = EXCLUDED.definition,
           description = EXCLUDED.description,
           process = EXCLUDED.process,
           dos = EXCLUDED.dos,
           donts = EXCLUDED.donts,
           things_to_look_out_for = EXCLUDED.things_to_look_out_for,
           implications = EXCLUDED.implications,
           indication = EXCLUDED.indication,
           contraindications = EXCLUDED.contraindications,
           updated_at = now()`,
        [
          f.id,
          f.category,
          f.title,
          f.definition,
          f.description,
          f.process,
          f.dos,
          f.donts,
          f.things_to_look_out_for,
          f.implications,
          f.indication,
          f.contraindications,
        ],
      );
    }

    console.warn(
      `Seeded ${HOSPITALS.length} facilities, ${DOCTORS.length} doctors, ` +
        `${ANNOUNCEMENTS.length} announcements, ${FIRST_AID.length} first-aid entries.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
