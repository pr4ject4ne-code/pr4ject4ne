/**
 * Static help content shown in the footer help panel, organized by
 * function/procedure. Kept as data (not hardcoded JSX) so new sections/topics
 * can be added without touching component logic. Content mirrors the tone and
 * facts already established elsewhere in the app (e.g. IHNCodeDisplay) —
 * do not contradict those.
 */

export interface HelpEntry {
  section: string;
  topic: string;
  answer: string;
}

export const HELP_CONTENT: HelpEntry[] = [
  {
    section: 'Finding a hospital',
    topic: 'The three search modes',
    answer:
      'The homepage search bar supports three ways to find care: "Nearest" uses your location (or a place you type in) to sort hospitals by distance and draw a route on the map; "By name" searches for a specific hospital you already know; and "By symptom" suggests hospitals based on what you describe. Symptom search recommends where to go — it does not diagnose you.',
  },
  {
    section: 'Finding a hospital',
    topic: 'Reading the map and route',
    answer:
      'Recommended or searched hospitals appear as pins on the map. The nearest match is highlighted, and a route line is drawn from your location to it. Tap a pin or its mini-profile card to see more, or open the full hospital profile page for photos, hours, doctors, and announcements.',
  },
  {
    section: 'Understanding your IHN code',
    topic: 'What it is',
    answer:
      'Your IHN (Integrated Hospital Network) code is your emergency access key. It stays the same until you choose to regenerate it, and it sits next to your Biodata on your dashboard.',
  },
  {
    section: 'Understanding your IHN code',
    topic: 'Regenerating your code',
    answer:
      'If you have shared your code more widely than you meant to, you can generate a new one from your dashboard by confirming your current password. This immediately invalidates the old code, so anyone you previously shared it with will need the new one. To keep it a stable, memorable key rather than one that changes on a whim, you can only regenerate it once every 30 days.',
  },
  {
    section: 'Understanding your IHN code',
    topic: 'Who to share it with',
    answer:
      'Share your IHN code with close relatives or friends so they — or a partner hospital — can pull up your biodata in an emergency, even if you cannot speak for yourself. You stay in control: the code only unlocks what you have chosen to fill in, and it is yours to share only with who you choose.',
  },
  {
    section: 'Understanding your IHN code',
    topic: 'Why it matters',
    answer:
      'In an emergency, every minute spent tracking down your medical history is a minute a hospital is not treating you. Your biodata (blood group, genotype, chronic conditions, allergies, next of kin) lets a partner hospital pull up the essentials the moment your IHN code is shared, which means faster triage and safer treatment.',
  },
  {
    section: 'Filling in your Biodata',
    topic: 'Why it matters',
    answer:
      'Filling in your Biodata makes emergencies faster and safer to handle — it is one of the core trust features of Racoon Eye. It is optional to fill in, but the more complete it is, the more useful it is in a crisis.',
  },
  {
    section: 'Filling in your Biodata',
    topic: 'Profile vs. Biodata — the two-layer split',
    answer:
      'Your dashboard has two layers. "Profile" is basic identity info (name, alias, gender, phone, email, date of birth, next of kin) and is always visible to you. "Biodata" is the deeper medical layer (chronic conditions, height/weight and other measurements, occupation, marital/religious status, genotype, blood group, disabilities, health preferences), and this is the part shared via your IHN code. Clinical fields are unverified for now; official documents (lab reports, medical records) are recommended but not required.',
  },
  {
    section: 'Filling in your Biodata',
    topic: 'BMI, genotype, and blood group',
    answer:
      'The Biodata form calculates your BMI automatically from height and weight, and shows what each range means (underweight, normal, overweight, obese). It also explains what genotype and blood group are and why hospitals ask for them (genotype compatibility matters for conditions like sickle cell disease, and blood group matters for transfusions). Tap "What do these mean?" next to each field for the full explanation.',
  },
  {
    section: 'Setting reminders',
    topic: 'Personal calendar reminders',
    answer:
      'Your dashboard calendar lets you set personal reminders (e.g. a medication schedule, a follow-up appointment). Tap a date to add a title, an optional time, and an optional note. These reminders are only visible to you; they are not shared with hospitals and do not send notifications, so check your calendar to see what is coming up.',
  },
  {
    section: 'Using First Aid',
    topic: 'What it is',
    answer:
      'The First Aid section is a read-only public reference of procedures and techniques (e.g. bleeding control, CPR, burns). It is developer-managed and can be browsed and filtered by topic tags without an account.',
  },
  {
    section: 'Using First Aid',
    topic: 'Not a diagnosis',
    answer:
      'First Aid content is educational reference material only — it is not medical advice and is not a substitute for professional care. Always back-check with a qualified professional and seek emergency help for serious situations.',
  },
  {
    section: 'Listing a hospital',
    topic: 'Registering your facility',
    answer:
      'Hospitals, clinics, pharmacies, and other facilities can be added via the "List your hospital" link in the footer. Fill in the basics (name, service type, address, contact details) and set your exact location by clicking or dragging the pin on the map. Submissions are reviewed by our team before appearing in search, and a facility can be updated any time by the developer or hospital staff account managing it.',
  },
  {
    section: 'Reporting an issue',
    topic: 'The suggestion tab',
    answer:
      'Every page has a "Suggestions" tab (usually floating near a corner of the screen). Use it to report incorrect hospital information, suggest a correction, or send general feedback — your message is routed to the support team, with an optional email if you want a reply.',
  },
];
