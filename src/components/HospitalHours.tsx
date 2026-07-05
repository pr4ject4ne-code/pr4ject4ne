import Card from './Card';
import styles from './HospitalHours.module.css';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export default function HospitalHours({
  hours,
  is24Hour,
}: {
  hours: Record<string, string>;
  is24Hour: boolean;
}) {
  const hasHours = hours && Object.keys(hours).length > 0;
  return (
    <Card as="section">
      <h2 className={styles.title}>Times of service and visit</h2>
      {is24Hour && <p className={styles.badge}>Open 24 hours</p>}
      {hasHours ? (
        <table className={styles.table}>
          <tbody>
            {DAY_ORDER.filter((d) => hours[d]).map((d) => (
              <tr key={d}>
                <th scope="row">{DAY_LABEL[d]}</th>
                <td>{hours[d]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !is24Hour && <p className={styles.muted}>Hours not provided.</p>
      )}
    </Card>
  );
}
