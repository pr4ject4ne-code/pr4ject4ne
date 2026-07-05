'use client';

import { useEffect, useState } from 'react';
import type { PublicUser } from '@/types';

interface SessionState {
  loading: boolean;
  user: PublicUser | null;
}

/** Client hook: resolves the current patient session via /api/auth/session. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ loading: true, user: null });

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active) setState({ loading: false, user: data?.user ?? null });
      })
      .catch(() => {
        if (active) setState({ loading: false, user: null });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
