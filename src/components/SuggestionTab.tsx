'use client';

import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
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
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setStatus('sending');
    try {
      const endpoint = hospitalId ? `/api/hospitals/${hospitalId}/suggestions` : '/api/suggestions';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, email: email || undefined, page }),
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
      <Modal open={open} onClose={() => setOpen(false)} title="Send a suggestion">
        {status === 'sent' ? (
          <p>Thank you — your feedback was received.</p>
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
            <Input
              label="Your email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="so we can follow up"
            />
            {status === 'error' && (
              <p role="alert" className={styles.error}>
                Could not send. Please try again.
              </p>
            )}
            <div className={styles.actions}>
              <Button type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
