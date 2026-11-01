import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { sessionRequestOptions } from '@/auth';

export function ExportButton() {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function download() {
    if (pending.current) return;
    pending.current = true;
    setPreparing(true); setError('');
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      // No finder parameters: every export includes all of the signed-in user's data.
      const response = await fetch(`${base}/api/export.xlsx`, sessionRequestOptions());
      if (!response.ok) {
        throw new Error(response.status === 401
          ? 'Please sign in again, then try exporting.'
          : "Couldn't prepare your export. Please try again.");
      }
      if (!response.headers.get('Content-Type')?.includes('spreadsheetml.sheet')) {
        throw new Error("Couldn't prepare your export. Please try again.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.headers.get('Content-Disposition')?.match(/InterviewPrep_\d{4}-\d{2}-\d{2}\.xlsx/)?.[0]
        ?? `InterviewPrep_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click(); link.remove();
      // Give phone download/preview handlers time to consume the blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('Please sign in')
        ? e.message : "Couldn't prepare your export. Please try again.");
    } finally {
      pending.current = false;
      setPreparing(false);
    }
  }
  return (
    <div className="min-w-0">
      <button type="button" onClick={() => void download()} disabled={preparing}
        data-testid="button-export-excel" aria-busy={preparing}
        className="ip-focus min-h-11 w-full sm:w-auto px-4 rounded-lg border bg-white inline-flex items-center justify-center gap-2 text-sm font-semibold hover:border-[color:var(--navy)] disabled:opacity-60">
        {preparing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        <span aria-live="polite">{preparing ? 'Preparing…' : 'Export to Excel'}</span>
      </button>
      {error && <p role="alert" data-testid="text-export-error" className="mt-2 max-w-sm text-sm font-medium"
        style={{ color: 'var(--score-1)' }}>{error}</p>}
    </div>
  );
}
