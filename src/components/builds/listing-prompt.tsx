'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

/**
 * The description of a configuration, ready to be handed to an AI that will
 * write the actual ad. The text is built on the server from the configuration
 * already on the page, so opening the panel costs nothing; it stays editable
 * because the last word on an ad belongs to whoever signs it.
 */
export function ListingPrompt({ text }: { text: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(text);
  // A part added or a price moved rewrites the text: the draft follows along,
  // the same way the asking price field follows the recommendation.
  const [generated, setGenerated] = useState(text);
  if (text !== generated) {
    setGenerated(text);
    setDraft(text);
  }

  // A fresh object on every copy, so the same message shown twice in a row
  // still restarts its own countdown.
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (feedback === null) return;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function copy(): Promise<void> {
    const value = textareaRef.current?.value ?? draft;

    // The clipboard API needs a secure context, which a self-hosted instance
    // reached over plain HTTP on the local network is not: selecting the
    // textarea and asking the document to copy still works there.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setFeedback({ tone: 'ok', message: 'Copié !' });
        return;
      }
    } catch {
      // Falls through to the selection-based copy below.
    }

    const textarea = textareaRef.current;
    if (textarea && document.execCommand) {
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
      if (document.execCommand('copy')) {
        setFeedback({ tone: 'ok', message: 'Copié !' });
        return;
      }
    }

    setFeedback({ tone: 'error', message: 'Copie impossible : sélectionnez le texte à la main.' });
  }

  return (
    // Collapsed by default: the text is written once, at the moment of
    // announcing, not read on every visit to the configuration.
    <details className="rounded-xl border border-border-subtle bg-surface-raised">
      <summary className="cursor-pointer list-none px-5 py-4 font-medium marker:content-none">
        Générer la description pour l’annonce{' '}
        <span className="text-sm font-normal text-ink-muted">
          — à coller dans une IA qui rédigera l’annonce
        </span>
      </summary>

      <div className="flex flex-col gap-3 border-t border-border-subtle p-5">
        <textarea
          ref={textareaRef}
          rows={14}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          aria-label="Description de la configuration pour l’annonce"
          className="w-full resize-y rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={copy}>
            Copier
          </Button>
          {draft === generated ? null : (
            <Button type="button" variant="ghost" onClick={() => setDraft(generated)}>
              Rétablir le texte généré
            </Button>
          )}
          <span
            aria-live="polite"
            className={`text-sm ${feedback?.tone === 'error' ? 'text-danger' : 'text-ok'}`}
          >
            {feedback?.message ?? ''}
          </span>
        </div>

        <p className="text-xs text-ink-muted">
          Le texte reprend les composants de la configuration et son prix ; modifiez-le avant de
          le copier si vous voulez ajouter un détail que le stock ne connaît pas.
        </p>
      </div>
    </details>
  );
}
