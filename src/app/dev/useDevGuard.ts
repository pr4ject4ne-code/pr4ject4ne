'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DevInfo {
  id: string;
  email: string;
  access_level: string | null;
  is_primary: boolean;
  is_secondary: boolean;
}

/** Redirects to the unified /login if there is no active developer session. */
export function useDevGuard(): { loading: boolean; dev: DevInfo | null } {
  const router = useRouter();
  const [state, setState] = useState<{ loading: boolean; dev: DevInfo | null }>({
    loading: true,
    dev: null,
  });

  useEffect(() => {
    let active = true;
    fetch('/api/dev/session')
      .then((res) => {
        if (res.status === 401) {
          router.replace('/login');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (active) setState({ loading: false, dev: data?.dev ?? null });
      })
      .catch(() => active && setState({ loading: false, dev: null }));
    return () => {
      active = false;
    };
  }, [router]);

  return state;
}
