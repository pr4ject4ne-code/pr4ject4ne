'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HospitalShell from '../HospitalShell';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import Stars from '@/components/Stars';
import PhotoUpload from '@/components/PhotoUpload';
import DoctorForm, { type DoctorFormValues } from '@/components/DoctorForm';
import AnnouncementForm, { type AnnouncementFormValues } from '@/components/AnnouncementForm';
import LocationPicker from '@/components/LocationPicker';
import type { Coords } from '@/lib/geolocation';
import type { Hospital, Doctor, Announcement, HospitalPhoto, HospitalDepartment } from '@/types';
import styles from './HospitalDashboard.module.css';

type Tab = 'info' | 'media' | 'hours' | 'departments' | 'announcements' | 'personnel';
const DAYS: Array<[string, string]> = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

interface SessionData {
  hospital: Hospital;
  doctors: Doctor[];
  announcements: Announcement[];
}

export default function HospitalDashboardClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SessionData | null>(null);
  const [tab, setTab] = useState<Tab>('info');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/hospital/session');
    if (res.status === 401) {
      router.replace('/login');
      return;
    }
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    const res = await fetch('/api/account/password', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const respData = await res.json();
    if (!res.ok) {
      setPwError(respData.error ?? 'Could not change password.');
      return;
    }
    setPwSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
  }

  if (loading || !data) {
    return (
      <HospitalShell title="Hospital Dashboard" showLogout={false}>
        <p>Loading…</p>
      </HospitalShell>
    );
  }

  const { hospital } = data;
  const hid = hospital.id;

  return (
    <HospitalShell title={hospital.name}>
      <nav className={styles.tabs} aria-label="Sections">
        {(
          [
            ['info', 'Info'],
            ['media', 'Media'],
            ['hours', 'Hours'],
            ['departments', 'Departments'],
            ['announcements', 'Announcements'],
            ['personnel', 'Personnel'],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={tab === value ? styles.activeTab : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className={styles.account} style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>My account password</h3>
        <Card variant="plain">
          <form onSubmit={changePassword}>
            <Input
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Button type="submit">Change password</Button>
          </form>
          {pwError && <p style={{ color: 'var(--color-red)', fontSize: '0.85rem', marginTop: '0.75rem' }}>{pwError}</p>}
          {pwSuccess && <p style={{ color: 'var(--color-green)', fontSize: '0.85rem', marginTop: '0.75rem' }}>Password changed. Your other sessions were signed out.</p>}
        </Card>
      </section>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {tab === 'info' && (
        <InfoTab
          hospital={hospital}
          saving={saving}
          onSave={async (patch) => {
            setSaving(true);
            const res = await fetch(`/api/hospital/${hid}/info`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(patch),
            });
            setSaving(false);
            if (res.ok) {
              flash('Info saved.');
              load();
            }
          }}
        />
      )}

      {tab === 'media' && (
        <PhotoUpload
          photos={hospital.photos}
          saving={saving}
          onSave={async (photos: HospitalPhoto[]) => {
            setSaving(true);
            const res = await fetch(`/api/hospital/${hid}/media`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ photos }),
            });
            setSaving(false);
            if (res.ok) {
              flash('Photos saved.');
              load();
            }
          }}
        />
      )}

      {tab === 'hours' && (
        <HoursTab
          hours={hospital.hours}
          saving={saving}
          onSave={async (hours) => {
            setSaving(true);
            const res = await fetch(`/api/hospital/${hid}/hours`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ hours }),
            });
            setSaving(false);
            if (res.ok) {
              flash('Hours saved.');
              load();
            }
          }}
        />
      )}

      {tab === 'departments' && (
        <DepartmentsTab
          departments={hospital.departments}
          saving={saving}
          onSave={async (departments) => {
            setSaving(true);
            const res = await fetch(`/api/hospital/${hid}/info`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ departments }),
            });
            setSaving(false);
            if (res.ok) {
              flash('Departments saved.');
              load();
            }
          }}
        />
      )}

      {tab === 'announcements' && (
        <AnnouncementsTab hid={hid} announcements={data.announcements} onChanged={load} flash={flash} />
      )}

      {tab === 'personnel' && (
        <PersonnelTab hid={hid} doctors={data.doctors} onChanged={load} flash={flash} />
      )}
    </HospitalShell>
  );
}

// ---------------------------------------------------------------------------

function InfoTab({
  hospital,
  onSave,
  saving,
}: {
  hospital: Hospital;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [name, setName] = useState(hospital.name);
  const [address, setAddress] = useState(hospital.address ?? '');
  const [city, setCity] = useState(hospital.city ?? '');
  const [website, setWebsite] = useState(hospital.website ?? '');
  const [phone, setPhone] = useState(hospital.contact_phone ?? '');
  const [email, setEmail] = useState(hospital.contact_email ?? '');
  const [showDoctors, setShowDoctors] = useState(hospital.show_doctors);
  const [lat, setLat] = useState(hospital.latitude != null ? String(hospital.latitude) : '');
  const [lng, setLng] = useState(hospital.longitude != null ? String(hospital.longitude) : '');

  const parsedLat = lat.trim() === '' ? null : Number(lat);
  const parsedLng = lng.trim() === '' ? null : Number(lng);

  function handlePin(coords: Coords) {
    setLat(String(coords.lat));
    setLng(String(coords.lng));
  }

  return (
    <Card variant="plain" as="section">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            address,
            city,
            website,
            contact_phone: phone,
            contact_email: email,
            show_doctors: showDoctors,
            latitude: Number.isFinite(parsedLat) ? parsedLat : null,
            longitude: Number.isFinite(parsedLng) ? parsedLng : null,
          });
        }}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
            Location — click or drag the pin, or type exact coordinates
          </span>
          <LocationPicker
            lat={Number.isFinite(parsedLat) ? (parsedLat as number) : null}
            lng={Number.isFinite(parsedLng) ? (parsedLng as number) : null}
            onChange={handlePin}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        </div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={showDoctors}
            onChange={(e) => setShowDoctors(e.target.checked)}
          />
          <span>Show a doctors section on your public profile</span>
        </label>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save info'}
        </Button>
      </form>
    </Card>
  );
}

function HoursTab({
  hours,
  onSave,
  saving,
}: {
  hours: Record<string, string>;
  onSave: (hours: Record<string, string>) => Promise<void>;
  saving: boolean;
}) {
  const [state, setState] = useState<Record<string, string>>(hours);
  return (
    <Card variant="plain" as="section">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(state);
        }}
      >
        {DAYS.map(([key, label]) => (
          <Input
            key={key}
            label={label}
            placeholder="e.g. 09:00–17:00 or Closed"
            value={state[key] ?? ''}
            onChange={(e) => setState((s) => ({ ...s, [key]: e.target.value }))}
          />
        ))}
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save hours'}
        </Button>
      </form>
    </Card>
  );
}

function DepartmentsTab({
  departments,
  onSave,
  saving,
}: {
  departments: HospitalDepartment[];
  onSave: (departments: HospitalDepartment[]) => Promise<void>;
  saving: boolean;
}) {
  const [state, setState] = useState<HospitalDepartment[]>(departments);
  const [newDeptName, setNewDeptName] = useState('');
  const [newServiceText, setNewServiceText] = useState<Record<number, string>>({});

  function addDepartment() {
    const name = newDeptName.trim();
    if (!name) return;
    setState((s) => [...s, { name, services: [] }]);
    setNewDeptName('');
  }

  function removeDepartment(index: number) {
    setState((s) => s.filter((_, i) => i !== index));
  }

  function renameDepartment(index: number, name: string) {
    setState((s) => s.map((d, i) => (i === index ? { ...d, name } : d)));
  }

  function addService(index: number) {
    const service = (newServiceText[index] ?? '').trim();
    if (!service) return;
    setState((s) =>
      s.map((d, i) => (i === index ? { ...d, services: [...d.services, service] } : d)),
    );
    setNewServiceText((m) => ({ ...m, [index]: '' }));
  }

  function removeService(deptIndex: number, serviceIndex: number) {
    setState((s) =>
      s.map((d, i) =>
        i === deptIndex ? { ...d, services: d.services.filter((_, j) => j !== serviceIndex) } : d,
      ),
    );
  }

  return (
    <Card variant="plain" as="section">
      <h2 className={styles.subheading}>Departments &amp; services</h2>
      <p className={styles.meta} style={{ marginBottom: '1rem' }}>
        Organize your services under departments (e.g. “Surgery” → General Surgery,
        Orthopaedics). Departments can be subclassed however you see fit.
      </p>

      {state.length === 0 && <p className={styles.meta}>No departments added yet.</p>}

      <ul className={styles.list}>
        {state.map((dept, i) => (
          <li key={i} className={styles.row} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Input
                label={`Department ${i + 1} name`}
                value={dept.name}
                onChange={(e) => renameDepartment(i, e.target.value)}
              />
              <Button variant="danger" onClick={() => removeDepartment(i)}>
                Remove department
              </Button>
            </div>

            <ul className={styles.list}>
              {dept.services.map((service, j) => (
                <li key={j} className={styles.row}>
                  <span>{service}</span>
                  <Button variant="ghost" onClick={() => removeService(i, j)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <Input
                label="Add service"
                placeholder="e.g. General Surgery"
                value={newServiceText[i] ?? ''}
                onChange={(e) => setNewServiceText((m) => ({ ...m, [i]: e.target.value }))}
              />
              <Button variant="secondary" onClick={() => addService(i)}>
                Add service
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: '1rem' }}>
        <Input
          label="New department name"
          placeholder="e.g. Diagnostics"
          value={newDeptName}
          onChange={(e) => setNewDeptName(e.target.value)}
        />
        <Button variant="secondary" onClick={addDepartment}>
          Add department
        </Button>
      </div>

      <Button
        type="button"
        disabled={saving}
        onClick={() => onSave(state)}
        style={{ marginTop: '1rem' }}
      >
        {saving ? 'Saving…' : 'Save departments'}
      </Button>
    </Card>
  );
}

function AnnouncementsTab({
  hid,
  announcements,
  onChanged,
  flash,
}: {
  hid: string;
  announcements: Announcement[];
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);

  async function create(values: AnnouncementFormValues) {
    setSaving(true);
    const res = await fetch(`/api/hospital/${hid}/announcements`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (res.ok) {
      flash('Announcement added.');
      onChanged();
    }
  }

  async function remove(a: Announcement) {
    await fetch(`/api/hospital/${hid}/announcements?announcement_id=${a.id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    flash('Announcement deleted.');
    onChanged();
  }

  return (
    <div>
      <Card variant="plain" as="section" style={{ marginBottom: '1rem' }}>
        <h2 className={styles.subheading}>New announcement</h2>
        <AnnouncementForm onSubmit={create} submitting={saving} />
      </Card>
      <ul className={styles.list}>
        {announcements.map((a) => (
          <li key={a.id} className={styles.row}>
            <div>
              <span className={`${styles.dot} ${styles[`dot_${a.color}`]}`} aria-hidden="true" />
              <strong>{a.title}</strong>
              {a.is_bar && <span className={styles.barBadge}>Bar</span>}
              {a.event_date && <span className={styles.date}>{a.event_date.slice(0, 10)}</span>}
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(a)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete announcement?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && remove(confirmDelete)}>
              Delete
            </Button>
          </>
        }
      >
        <p>Delete “{confirmDelete?.title}”?</p>
      </Modal>
    </div>
  );
}

function PersonnelTab({
  hid,
  doctors,
  onChanged,
  flash,
}: {
  hid: string;
  doctors: Doctor[];
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Doctor | null>(null);

  async function add(values: DoctorFormValues) {
    setSaving(true);
    const res = await fetch(`/api/hospital/${hid}/personnel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (res.ok) {
      flash('Doctor added.');
      onChanged();
    }
  }

  async function remove(d: Doctor) {
    await fetch(`/api/hospital/${hid}/personnel?doctor_id=${d.id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    flash('Doctor removed.');
    onChanged();
  }

  return (
    <div>
      <Card variant="plain" as="section" style={{ marginBottom: '1rem' }}>
        <h2 className={styles.subheading}>Add doctor</h2>
        <DoctorForm onSubmit={add} submitting={saving} submitLabel="Add doctor" />
      </Card>
      <ul className={styles.list}>
        {doctors.map((d) => (
          <li key={d.id} className={styles.row}>
            <div>
              <strong>{d.name}</strong>
              <span className={styles.meta}>
                {[d.specialty, d.level].filter(Boolean).join(' · ')}
              </span>
              {d.rating_count > 0 && <Stars value={d.rating_avg} count={d.rating_count} />}
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(d)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remove doctor?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && remove(confirmDelete)}>
              Remove
            </Button>
          </>
        }
      >
        <p>Remove {confirmDelete?.name} from the roster?</p>
      </Modal>
    </div>
  );
}
