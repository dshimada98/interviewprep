import { useState } from 'react';
import { Loader2, Pencil, RotateCcw } from 'lucide-react';
import type { RubricEntry, RubricScope } from '@workspace/api-client-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ErrText, ErrorPanel, Shell } from './sessions';
import { rubricErr, useRubric, useRubricMutations } from './rubric-query';
import { TipsList } from './rubric-help';

type Muts = ReturnType<typeof useRubricMutations>;

function EntryEditor({ scope, e, muts, onDone }: { scope: string; e: RubricEntry; muts: Muts; onDone: () => void }) {
  const [v, setV] = useState(e.description);
  const [err, setErr] = useState('');
  const id = `rubric-${scope}-${e.score}`;
  const save = () => {
    const t = v.trim();
    if (!t) return setErr('Please describe what this score means.');
    if (t.length > 200) return setErr('Please keep it under 200 characters.');
    setErr('');
    muts.update.mutate({ scope, score: e.score, data: { description: t } }, {
      onSuccess: onDone,
      onError: x => setErr(rubricErr(x, "Couldn't save this level. Please try again.")),
    });
  };
  const busy = muts.update.isPending;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="sr-only">Description for {e.score}, {e.level_name}</label>
      <textarea id={id} rows={3} value={v} disabled={busy} onChange={x => setV(x.target.value)} data-testid={`input-rubric-${scope}-${e.score}`}
        aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
        className="ip-focus block w-full min-h-11 rounded-lg border bg-white px-3 py-2 text-base" style={{ borderColor: err ? '#C0392B' : undefined }} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} data-testid={`button-save-rubric-${scope}-${e.score}`}
          className="ip-focus min-h-11 px-4 rounded-lg font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60" style={{ background: 'var(--navy)' }}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? 'Saving...' : 'Save'}</button>
        <button type="button" onClick={onDone} disabled={busy} data-testid={`button-cancel-rubric-${scope}-${e.score}`}
          className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold">Cancel</button>
        <span className={`ml-auto text-xs tabular-nums ${v.trim().length > 200 ? 'font-semibold' : 'text-muted-foreground'}`} style={v.trim().length > 200 ? { color: '#C0392B' } : undefined}>{v.trim().length}/200</span>
      </div>
      {err && <ErrText id={`${id}-err`}>{err}</ErrText>}
    </div>
  );
}

function Desc({ scope, e, muts, editing, setEditing }: { scope: string; e: RubricEntry; muts: Muts; editing: boolean; setEditing: (on: boolean) => void }) {
  if (editing) return <EntryEditor scope={scope} e={e} muts={muts} onDone={() => setEditing(false)} />;
  return (
    <div className="flex items-start gap-2">
      <p className="flex-1 min-w-0 break-words" data-testid={`text-rubric-${scope}-${e.score}`}>
        {e.description}
        {e.edited && <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider align-middle" style={{ background: 'var(--panel)', color: 'var(--green-text)' }} data-testid={`label-edited-${scope}-${e.score}`}>edited</span>}
      </p>
      <button type="button" onClick={() => setEditing(true)} data-testid={`button-edit-rubric-${scope}-${e.score}`} aria-label={`Edit ${e.level_name} description`}
        className="ip-focus min-h-11 shrink-0 px-3 rounded-lg inline-flex items-center gap-1.5 text-sm font-semibold hover:bg-[color:var(--panel)]">
        <Pencil className="h-3.5 w-3.5" aria-hidden />Edit</button>
    </div>
  );
}

function ScopeBlock({ s, muts, i }: { s: RubricScope; muts: Muts; i: number }) {
  const [editing, setEditing] = useState<Record<number, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const entries = [...s.entries].sort((a, b) => a.score - b.score);
  const anyEdited = entries.some(e => e.edited);
  const ed = (n: number) => (on: boolean) => setEditing(p => ({ ...p, [n]: on }));
  const busy = muts.reset.isPending && muts.reset.variables?.scope === s.scope;
  const doReset = () => {
    setErr('');
    muts.reset.mutate({ scope: s.scope }, {
      onSuccess: () => { setConfirm(false); setEditing({}); },
      onError: x => { setConfirm(false); setErr(rubricErr(x, "Couldn't reset this section. Please try again.")); },
    });
  };
  return (
    <section className="ip-rise rounded-xl border bg-white p-4 sm:p-6 min-w-0" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} data-testid={`section-rubric-${s.scope}`} aria-labelledby={`h-rubric-${s.scope}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`h-rubric-${s.scope}`} className="text-lg font-bold tracking-tight">{s.name}</h2>
          <p className="text-sm text-muted-foreground" data-testid={`text-rubric-subtitle-${s.scope}`}>{s.subtitle}</p>
        </div>
        <button type="button" onClick={() => setConfirm(true)} disabled={busy} data-testid={`button-reset-rubric-${s.scope}`}
          className="ip-focus min-h-11 shrink-0 px-4 rounded-lg border bg-white inline-flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60">
          <RotateCcw className="h-4 w-4" aria-hidden />Reset to default</button>
      </div>
      {err && <div className="mt-3"><ErrText>{err}</ErrText></div>}
      <table className="hidden md:table mt-4 w-full text-sm table-fixed">
        <thead><tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
          <th className="py-2 pr-3 w-16">Score</th><th className="py-2 pr-3 w-36">Level</th><th className="py-2">Description</th>
        </tr></thead>
        <tbody className="divide-y">
          {entries.map(e => (
            <tr key={e.score} className="align-top" data-testid={`row-rubric-${s.scope}-${e.score}`}>
              <td className="py-3 pr-3"><span className="inline-grid h-8 w-8 place-items-center rounded-md font-bold text-white tabular-nums" style={{ background: `var(--score-${e.score})` }}>{e.score}</span></td>
              <td className="py-3 pr-3 font-semibold pt-4">{e.level_name}</td>
              <td className="py-1.5"><Desc scope={s.scope} e={e} muts={muts} editing={!!editing[e.score]} setEditing={ed(e.score)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="md:hidden mt-4 space-y-2">
        {entries.map(e => (
          <li key={e.score} className="rounded-lg border p-3 text-sm" style={{ borderLeft: `4px solid var(--score-${e.score})` }} data-testid={`card-rubric-${s.scope}-${e.score}`}>
            <p className="flex items-center gap-2 font-semibold"><span className="tabular-nums">{e.score}</span><span aria-hidden className="text-muted-foreground">/</span>{e.level_name}</p>
            <div className="mt-1"><Desc scope={s.scope} e={e} muts={muts} editing={!!editing[e.score]} setEditing={ed(e.score)} /></div>
          </li>
        ))}
      </ol>
      <AlertDialog open={confirm} onOpenChange={o => { if (!busy) setConfirm(o); }}>
        <AlertDialogContent className="rounded-xl" style={{ color: 'var(--navy)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {s.name} to default?</AlertDialogTitle>
            <AlertDialogDescription>{anyEdited ? 'Your edits to this section will be removed. Other sections stay as they are.' : 'This section already uses the default descriptions.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-reset" className="ip-focus min-h-11 mt-0" disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-reset" disabled={busy} onClick={x => { x.preventDefault(); doReset(); }}
              className="ip-focus min-h-11 text-white inline-flex items-center gap-2" style={{ background: 'var(--navy)' }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? 'Resetting...' : 'Reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function RubricPage() {
  const q = useRubric();
  const muts = useRubricMutations();
  return (
    <Shell title="Rubric">
      <div className="ip-rise">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--green-text)' }}>Scoring standard</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Rubric</h1>
      </div>
      <aside className="ip-rise mt-6 rounded-xl p-5" style={{ background: 'var(--panel)', animationDelay: '40ms' }} data-testid="section-rubric-tips">
        <h2 className="text-sm font-bold">Calibration tips</h2>
        <TipsList />
      </aside>
      {q.isLoading ? (
        <div className="mt-6 space-y-4" aria-busy="true"><span className="sr-only" role="status">Loading rubric</span>
          {[0, 1, 2].map(i => <div key={i} className="ip-skel h-56 rounded-xl" />)}
        </div>
      ) : q.error || !q.data ? (
        <ErrorPanel msg="Unable to load your rubric. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : (
        <div className="mt-6 space-y-5">{q.data.scopes.map((s, i) => <ScopeBlock key={s.scope} s={s} muts={muts} i={i} />)}</div>
      )}
    </Shell>
  );
}
