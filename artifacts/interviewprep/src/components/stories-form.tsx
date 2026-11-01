import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  getGetQuestionTypesQueryKey, useCreateStory, useGetQuestionTypes, useGetStory, useUpdateStory,
  type StoryDetail, type StoryInput,
} from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';
import { BackLink, ErrText, ErrorPanel, Shell, use401 } from './sessions';
import { CategorySelect } from './category-select';
import { invalidateStories, statusOf, storyDetailKey } from './session-keys';

const MAX_INT = 2147483647;
export function parseStoryId(raw?: string) {
  const n = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_INT ? n : null;
}

export function useStoryQuery(id: number | null) {
  const { user } = useAuth();
  const q = useGetStory(id ?? 0, {
    query: { queryKey: storyDetailKey(id ?? 0, user?.id), enabled: !!user && id !== null, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  use401(q.error);
  return q;
}

export function useBehavioralTypes() {
  const { user } = useAuth();
  const q = useGetQuestionTypes({
    query: { queryKey: [...getGetQuestionTypesQueryKey(), user?.id], enabled: !!user, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  use401(q.error);
  return q;
}

export function StoryNotFound() {
  return (
    <div className="ip-rise mt-6 rounded-xl p-8 text-center" style={{ background: 'var(--panel)' }} data-testid="status-story-not-found">
      <h1 className="text-2xl font-bold">Story not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or the link is incorrect.</p>
      <Link href="/stories" className="ip-focus mt-6 min-h-11 px-5 rounded-lg inline-flex items-center font-semibold text-white" style={{ background: 'var(--navy)' }}>Back to stories</Link>
    </div>
  );
}

export const STAR = [
  { k: 'situation', label: 'Situation', letter: 'S', hint: 'Where and when? What was at stake?' },
  { k: 'task', label: 'Task', letter: 'T', hint: 'What were you responsible for?' },
  { k: 'action', label: 'Action', letter: 'A', hint: 'What did YOU do, step by step?' },
  { k: 'result', label: 'Result', letter: 'R', hint: 'What happened? Quantify it if you can.' },
] as const;

type Vals = { title: string; competency_id: string; context: string; situation: string; task: string; action: string; result: string };
type Errs = Partial<Record<keyof Vals | 'form', string>>;
const EMPTY: Vals = { title: '', competency_id: '', context: '', situation: '', task: '', action: '', result: '' };
const TEXTS = ['context', 'situation', 'task', 'action', 'result'] as const;
const SAVE_ERROR = "Couldn't save your story. Please try again.";

function validate(v: Vals, ids: Set<number>): [Errs, StoryInput | null] {
  const e: Errs = {};
  const title = v.title.trim();
  if (!title) e.title = 'Please give your story a short title.';
  else if (title.length > 300) e.title = 'Title must be 300 characters or fewer.';
  const c = Number(v.competency_id);
  if (!v.competency_id || !ids.has(c)) e.competency_id = 'Please choose the main competency this story shows.';
  for (const k of TEXTS) if (v[k].trim().length > 4000) e[k] = 'Must be 4000 characters or fewer.';
  if (Object.keys(e).length) return [e, null];
  const t = (s: string) => s.trim() || null;
  return [e, { title, competency_id: c, context: t(v.context), situation: t(v.situation), task: t(v.task), action: t(v.action), result: t(v.result) }];
}

function serverErrs(err: unknown): Errs {
  if (statusOf(err) === 400 && err && typeof err === 'object' && 'data' in err) {
    const data = err.data as { errors?: Record<string, unknown> } | null;
    const out = Object.fromEntries(Object.entries(data?.errors ?? {})
      .filter(([k, val]) => k in EMPTY && typeof val === 'string')) as Errs;
    if (Object.keys(out).length) return out;
  }
  return { form: SAVE_ERROR };
}

const inputCls = 'ip-focus block w-full min-w-0 min-h-11 rounded-lg border bg-white px-3.5 text-base transition-colors hover:border-[color:var(--navy)]';

function AutoGrow({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void; id: string; 'data-testid': string; 'aria-invalid': boolean; 'aria-describedby'?: string; style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return <textarea ref={ref} rows={4} value={value} onChange={e => onChange(e.target.value)} {...rest}
    className={`${inputCls} py-3 leading-relaxed resize-none overflow-hidden min-h-[7.5rem]`} />;
}

function Err({ id, msg }: { id: string; msg?: string }) { return msg ? <ErrText id={`${id}-err`}>{msg}</ErrText> : null; }
const a11y = (id: string, err?: string, hint?: boolean) => ({
  id, 'aria-invalid': !!err, 'aria-describedby': err ? `${id}-err` : hint ? `${id}-hint` : undefined,
  style: { borderColor: err ? '#C0392B' : undefined },
});

function StoryForm({ initial, submitLabel, busy, cancelHref, serverErrors, onSubmit }: {
  initial: Vals; submitLabel: string; busy: boolean; cancelHref: string; serverErrors: Errs; onSubmit: (d: StoryInput) => void;
}) {
  const [v, setV] = useState<Vals>(initial);
  const [errs, setErrs] = useState<Errs>({});
  const [adding, setAdding] = useState(false);
  const types = useBehavioralTypes();
  const formRef = useRef<HTMLFormElement>(null);
  const focus = useRef(false);
  const ids = new Set((types.data?.behavioral ?? []).map(t => t.id));

  useEffect(() => { if (Object.keys(serverErrors).length) { focus.current = true; setErrs(serverErrors); } }, [serverErrors]);
  useEffect(() => {
    if (!focus.current || !Object.keys(errs).length) return;
    focus.current = false;
    const t = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[data-testid="status-story-form-error"]');
    t?.focus({ preventScroll: true });
    t?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [errs]);

  const set = (k: keyof Vals) => (val: string) => {
    const next = { ...v, [k]: val };
    setV(next);
    const [rem] = validate(next, ids);
    setErrs(p => { if (!p[k] || rem[k]) return p; const u = { ...p }; delete u[k]; return u; });
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (adding) { focus.current = true; setErrs({ form: 'Save or cancel your new category before saving the story.' }); return; }
    if (!types.data) { focus.current = true; setErrs({ form: 'Please load the competencies before saving.' }); return; }
    const [er, input] = validate(v, ids);
    if (!input) { focus.current = true; setErrs(er); return; }
    setErrs({});
    onSubmit(input);
  }

  const fieldErr = Object.keys(errs).some(k => k !== 'form');
  const count = (s: string) => <p className="text-xs text-muted-foreground text-right tabular-nums">{s.trim().length}/4000</p>;
  const Label = ({ id, children, optional }: { id: string; children: ReactNode; optional?: boolean }) => (
    <label htmlFor={id} className="block text-sm font-semibold">{children}{optional && <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>}</label>
  );

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="ip-rise mt-6 space-y-8">
      {Object.keys(errs).length > 0 && (
        <div tabIndex={-1} className="rounded-lg bg-white border-l-4 p-3" style={{ borderColor: '#C0392B' }} data-testid="status-story-form-error">
          <ErrText>{fieldErr ? 'Please fix the highlighted fields.' : errs.form}</ErrText>
        </div>
      )}
      <section className="rounded-xl p-5 sm:p-8 space-y-5" style={{ background: 'var(--panel)' }}>
        <div className="space-y-1.5">
          <Label id="title">Title</Label>
          <input {...a11y('title', errs.title, true)} data-testid="input-story-title" className={inputCls} value={v.title} maxLength={600}
            placeholder="Turned around a late budget reforecast" onChange={e => set('title')(e.target.value)} />
          {errs.title ? <Err id="title" msg={errs.title} /> : <p id="title-hint" className="text-xs text-muted-foreground">A short name you will recognise in a list.</p>}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5 min-w-0">
            <Label id="competency_id">Main competency</Label>
            {types.isLoading ? <div className="ip-skel h-11 rounded-lg" aria-busy="true"><span className="sr-only">Loading competencies</span></div>
              : types.error && !types.data ? (
                <div className="space-y-2">
                  <ErrText>Unable to load competencies.</ErrText>
                  <button type="button" data-testid="button-retry-competencies" onClick={() => void types.refetch()} disabled={types.isFetching} className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold">{types.isFetching ? 'Retrying...' : 'Retry'}</button>
                </div>
              ) : (
                <CategorySelect id="competency_id" testid="select-story-competency" className={inputCls}
                  invalid={!!errs.competency_id} describedBy={errs.competency_id ? 'competency_id-err' : undefined}
                  style={{ borderColor: errs.competency_id ? '#C0392B' : undefined }}
                  value={v.competency_id} onChange={set('competency_id')} placeholder="Choose a competency"
                  options={types.data?.behavioral ?? []} allowAdd disabled={busy} onAddingChange={setAdding} />
              )}
            <Err id="competency_id" msg={errs.competency_id} />
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label id="context" optional>Context</Label>
            <input {...a11y('context', errs.context, true)} data-testid="input-story-context" className={inputCls} value={v.context}
              placeholder="FP&A, budget reforecast" onChange={e => set('context')(e.target.value)} />
            {errs.context ? <Err id="context" msg={errs.context} /> : <p id="context-hint" className="text-xs text-muted-foreground">Role, team, or project, in a few words.</p>}
          </div>
        </div>
      </section>

      <section aria-label="STAR" className="space-y-6">
        {STAR.map((s, i) => (
          <div key={s.k} className="ip-rise grid gap-3 sm:grid-cols-[3rem_minmax(0,1fr)]" style={{ animationDelay: `${60 + i * 50}ms` }}>
            <span aria-hidden className="hidden sm:grid h-12 w-12 place-items-center rounded-lg text-xl font-bold text-white" style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>{s.letter}</span>
            <div className="space-y-1.5 min-w-0">
              <label htmlFor={s.k} className="block text-base font-bold">{s.label}<span className="ml-1.5 text-sm font-normal text-muted-foreground">(optional)</span></label>
              <p id={`${s.k}-hint`} className="text-sm text-muted-foreground">{s.hint}</p>
              <AutoGrow {...a11y(s.k, errs[s.k], true)} aria-describedby={errs[s.k] ? `${s.k}-err` : `${s.k}-hint`} data-testid={`input-story-${s.k}`} value={v[s.k]} onChange={set(s.k)} />
              {errs[s.k] ? <Err id={s.k} msg={errs[s.k]} /> : count(v[s.k])}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t pt-6">
        <Link href={cancelHref} data-testid="link-cancel-story" className="ip-focus min-h-11 px-5 rounded-lg inline-flex items-center justify-center font-semibold border bg-white">Cancel</Link>
        <button type="submit" disabled={busy || adding} data-testid="button-save-story"
          className="ip-focus min-h-11 px-6 rounded-lg font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.99] transition-transform"
          style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function NewStoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [srvErr, setSrvErr] = useState<Errs>({});
  const create = useCreateStory({ request: sessionRequestOptions() });
  use401(create.error);
  return (
    <Shell title="New story">
      <BackLink href="/stories">All stories</BackLink>
      <h1 className="ip-rise mt-3 text-3xl font-bold tracking-tight">New story</h1>
      <p className="mt-2 text-sm text-muted-foreground">Write it once in STAR order, then practice telling it.</p>
      <StoryForm initial={EMPTY} submitLabel="Save story" busy={create.isPending} cancelHref="/stories" serverErrors={srvErr}
        onSubmit={data => create.mutate({ data }, {
          onSuccess: s => { qc.setQueryData(storyDetailKey(s.id, user?.id), s); void invalidateStories(qc, user?.id); nav(`/stories/${s.id}`); },
          onError: e => setSrvErr(serverErrs(e)),
        })} />
    </Shell>
  );
}

const toVals = (s: StoryDetail): Vals => ({
  title: s.title, competency_id: String(s.competency_id), context: s.context ?? '',
  situation: s.situation ?? '', task: s.task ?? '', action: s.action ?? '', result: s.result ?? '',
});

export function EditStoryPage({ rawId }: { rawId?: string }) {
  const id = parseStoryId(rawId);
  const { user } = useAuth();
  const q = useStoryQuery(id);
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [srvErr, setSrvErr] = useState<Errs>({});
  const update = useUpdateStory({ request: sessionRequestOptions() });
  use401(update.error);
  const snap = useRef<{ id: number; vals: Vals } | null>(null);
  if (q.data && !q.isFetching && !q.error && id !== null && snap.current?.id !== id) snap.current = { id, vals: toVals(q.data) };
  const gone = id === null || statusOf(q.error) === 404 || statusOf(update.error) === 404;
  return (
    <Shell title="Edit story">
      <BackLink href={id ? `/stories/${id}` : '/stories'}>Back to story</BackLink>
      {gone ? <StoryNotFound /> : q.isLoading || (!snap.current && !q.error) ? (
        <div className="mt-6 space-y-4" aria-busy="true"><span className="sr-only" role="status">Loading story</span>
          <div className="ip-skel h-8 w-48 rounded" /><div className="ip-skel h-96 rounded-xl" />
        </div>
      ) : q.error && !snap.current ? (
        <ErrorPanel msg="Unable to load this story. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : snap.current ? (
        <>
          <h1 className="ip-rise mt-3 text-3xl font-bold tracking-tight">Edit story</h1>
          <StoryForm key={id} initial={snap.current.vals} submitLabel="Save changes" busy={update.isPending} cancelHref={`/stories/${id}`} serverErrors={srvErr}
            onSubmit={data => update.mutate({ id, data }, {
              onSuccess: s => { qc.setQueryData(storyDetailKey(s.id, user?.id), s); void invalidateStories(qc, user?.id); snap.current = null; nav(`/stories/${s.id}`); },
              onError: e => { if (statusOf(e) === 404) { void invalidateStories(qc, user?.id); return; } setSrvErr(serverErrs(e)); },
            })} />
        </>
      ) : null}
    </Shell>
  );
}
