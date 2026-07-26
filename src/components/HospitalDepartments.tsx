'use client';

import { useState } from 'react';
import Card from './Card';
import type { HospitalDepartment } from '@/types';
import styles from './HospitalDepartments.module.css';

/** Public display of a hospital's departments and their services (worklist #14). */
export default function HospitalDepartments({
  departments,
}: {
  departments: HospitalDepartment[];
}) {
  const [open, setOpen] = useState(true);

  if (departments.length === 0) return null;

  return (
    <Card variant="plain" as="section">
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <h2 className={styles.title}>Departments ({departments.length})</h2>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className={styles.list}>
          {departments.map((dept, i) => (
            <li key={i} className={styles.dept}>
              <span className={styles.deptName}>{dept.name}</span>
              {dept.services.length > 0 ? (
                <ul className={styles.services}>
                  {dept.services.map((service, j) => (
                    <li key={j} className={styles.service}>
                      {service}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No services listed under this department.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
