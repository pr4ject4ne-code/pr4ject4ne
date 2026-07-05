import { Suspense } from 'react';
import HomeClient from './HomeClient';

export const metadata = {
  title: 'Racoon Eye — Find hospitals near you',
};

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeClient />
    </Suspense>
  );
}
