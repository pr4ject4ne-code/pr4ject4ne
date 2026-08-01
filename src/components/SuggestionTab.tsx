'use client';

import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import ErrorBubble from './ErrorBubble';
import { useSession } from '@/lib/useSession';
import styles from './SuggestionTab.module.css';

interface SuggestionTabProps {
  /** Optional hospital id — if set, feedback attaches to that hospital. */
  hospitalId?: string;
  page?: string;
}

/**
 * Floating "suggestion" affordance shown on every page. Submits to a server
 * endpoint which routes to the support email — the email is never in the client.
 */
export default function SuggestionTab({ hospitalId, page }: SuggestionTabProps) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Founder ask, 2026-07-29: "make a return email to be that of the profile
  // (must sign in or add a return email)" — a suggestion with no way to
  // reply was effectively unreachable feedback. A signed-in patient's own
  // account email is used automatically (no need to ask again); a visitor
  // who isn't signed in must supply one so there's always a way to follow up.
  const returnEmail = user?.email || email;
  const emailSatisfied = Boolean(user) || email.trim().length > 0;

  // Bug fix (founder report, 2026-07-28: "the slot is not auto refreshing to
  // permit new suggestions") — this component stays mounted for the whole
  // page lifetime (rendered once by Layout), so `status` never reset back to
  // 'idle' on its own: after one successful submission, reopening the modal
  // kept showing the "Thank you" message forever, with no way to send a
  // second suggestion short of a full page reload. Resetting on close means
  // every fresh open starts a clean form.
  function closeAndReset() {
    setOpen(false);
    setStatus('idle');
    setContent('');
    setEmail('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !emailSatisfied) return;
    setStatus('sending');
    try {
      const endpoint = hospitalId ? `/api/hospitals/${hospitalId}/suggestions` : '/api/suggestions';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, email: returnEmail || undefined, page }),
      });
      setStatus(res.ok ? 'sent' : 'error');
      if (res.ok) setContent('');
    } catch {
      setStatus('error');
    }
  }

  return (
    <>
      <button type="button" className={styles.tab} onClick={() => setOpen(true)}>
        Suggestions
      </button>
      <Modal open={open} onClose={closeAndReset} title="Send a suggestion">
        {status === 'sent' ? (
          <p>Thank you, your feedback was received.</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="suggestion-content" className={styles.label}>
              Your suggestion or correction
            </label>
            <textarea
              id="suggestion-content"
              className={styles.textarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              maxLength={4000}
              required
            />
            {user ? (
              <p className={styles.returnEmailNote}>
                We&apos;ll follow up at {user.email} if needed.
              </p>
            ) : (
              <Input
                label="Your email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="so we can follow up"
                hint="Required so we have a way to reach you, or sign in and we'll use your account email."
                required
              />
            )}
            <ErrorBubble
              variant="banner"
              message={status === 'error' ? 'Could not send. Please try again.' : null}
            />
            <div className={styles.actions}>
              <Button type="submit" disabled={status === 'sending' || !emailSatisfied}>
                {status === 'sending' ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
