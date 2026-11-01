import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  getGetQuestionTypesQueryKey, useGetQuestionTypes,
  type GroupedQuestionTypes, type ListSessionsKind, type ListSessionsParams, type ListSessionsScore, type ListSessionsSort,
} from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';
import { NO_BOOK, useCaseBooks } from './case-book-select';
import { caseBookLabel } from './case-book-label';

const KINDS: { v: ListSessionsKind | ''; label: string }[] = [{ v: '', label: 'All' }, { v: 'case', label: 'Case' }, { v: 'behavioral', label: 'Behavioral' }];
const SCORES: { v: ListSessionsScore | ''; label: string; color: string }[] = [
  { v: '', label: 'Any', color: 'var(--navy)' },
  { v: 'low', label: '1-2', color: 'var(--score-1)' },
  { v: 'mid', label: '3', color: 'var(--score-3)' },
  { v: 'high', label: '4-5', color: 'var(--score-5)' },
];
const SORTS: { v: ListSessionsSort; label: string }[] = [
  { v: 'newest', label: 'Newest first' }, { v: 'oldest', label: 'Oldest first' },
  { v: 'highest', label: 'Highest score' }, { v: 'lowest', label: 'Lowest score' },
];

export type FinderState = { q: string; kind: ListSessionsKind | ''; type: number | null; score: ListSessionsScore | ''; sort: ListSessionsSort; book: string };

function parse(search: string): FinderState {
  const p = new URLSearchParams(search);
  const kind = p.get('kind'), score = p.get('score'), sort = p.get('sort'), type = p.get('type') ?? '', book = p.get('book') ?? '';
  const t = /^\d{1,10}$/.test(type) ? Number(type) : NaN;
  return {
    q: p.get('q') ?? '',
    kind: kind === 'case' || kind === 'behavioral' ? kind : '',
    type: Number.isSafeInteger(t) && t > 0 && t <= 2147483647 ? t : null,
    score: score === 'low' || score === 'mid' || score === 'high' ? score : '',
    sort: SORTS.some(s => s.v === sort) ? (sort as ListSessionsSort) : 'newest',
    book: book === 'none' || (/^\d{1,10}$/.test(book) && Number(book) > 0 && Number(book) <= 2147483647) ? book : '',
  };
}
function serialize(s: FinderState) {
  const p = new URLSearchParams();
  if (s.q.trim()) p.set('q', s.q);
  if (s.kind) p.set('kind', s.kind);
  if (s.type !== null) p.set('type', String(s.type));
  if (s.score) p.set('score', s.score);
  if (s.book) p.set('book', s.book);
  if (s.sort !== 'newest') p.set('sort', s.sort);
  const str = p.toString();
  return str ? `/sessions?${str}` : '/sessions';
}

/** URL-backed finder state. The URL is the source of truth; only the search box text is local while debouncing. */
export function useSessionFinder() {
  const { user } = useAuth();
  const search = useSearch();
  const [, nav] = useLocation();
  const url = parse(search);
  const [text, setText] = useState(url.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlQ = useRef(url.q);
  // Back/forward or external URL changes resync the box.
  useEffect(() => {
    if (url.q !== lastUrlQ.current) { lastUrlQ.current = url.q; setText(url.q); }
  }, [url.q]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const restore = () => {
      // A pending keystroke must not replace the URL restored by browser Back.
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      const restored = parse(window.location.search).q;
      lastUrlQ.current = restored;
      setText(restored);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const types = useGetQuestionTypes({
    query: { queryKey: [...getGetQuestionTypesQueryKey(), user?.id], enabled: !!user, retry: false },
    request: sessionRequestOptions(),
  });
  const grouped: GroupedQuestionTypes | undefined = types.data;
  // Ignore a type from the URL that does not exist, or that conflicts with the chosen kind.
  const allowed = grouped ? (url.kind ? grouped[url.kind] : [...grouped.case, ...grouped.behavioral]) : [];
  const typeValid = url.type !== null && allowed.some(t => t.id === url.type);
  const typePending = url.type !== null && types.isLoading;
  const books = useCaseBooks();
  // Ignore an unknown book id from the URL once the list loads.
  const bookValid = url.book === 'none' || (!!url.book && !!books.data?.books.some(b => String(b.id) === url.book));
  const bookPending = !!url.book && url.book !== 'none' && books.isLoading;
  const state: FinderState = { ...url, type: typeValid ? url.type : null, book: bookValid ? url.book : '' };

  const write = (next: FinderState, replace = false) => nav(serialize(next), { replace });
  const update = (patch: Partial<FinderState>) => write({ ...state, q: lastUrlQ.current, ...patch });

  function setSearch(v: string) {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      lastUrlQ.current = v;
      write({ ...parse(window.location.search), q: v }, true);
    }, 300);
  }
  function setKind(kind: FinderState['kind']) {
    const keep = state.type !== null && grouped && (!kind || grouped[kind].some(t => t.id === state.type));
    update({ kind, type: keep ? state.type : null });
  }
  function clear() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    lastUrlQ.current = ''; setText('');
    nav('/sessions');
  }

  const params: ListSessionsParams = {
    q: state.q.trim() || undefined,
    kind: state.kind || undefined,
    type: state.type ?? undefined,
    score: state.score || undefined,
    sort: state.sort === 'newest' ? undefined : state.sort,
    book: state.book || undefined,
  };
  const filterCount = (state.kind ? 1 : 0) + (state.type !== null ? 1 : 0) + (state.score ? 1 : 0) + (state.book ? 1 : 0) + (state.sort !== 'newest' ? 1 : 0);
  const active = filterCount > 0 || !!state.q.trim() || !!text.trim();
  return { state, text, params, ready: !typePending && !bookPending, grouped, books: books.data?.books, booksError: !!books.error, typesError: !!types.error, filterCount, active, setSearch, setKind, update, clear };
}

export type SessionFinder = ReturnType<typeof useSessionFinder>;

function Seg<T extends string>({ label, value, options, onChange, testid }: {
  label: string; value: T; testid: string; onChange: (v: T) => void;
  options: { v: T; label: string; color?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border bg-white p-0.5 shrink-0">
      {options.map(o => {
        const on = o.v === value;
        const c = o.color ?? 'var(--navy)';
        return (
          <button key={o.v || 'all'} type="button" role="radio" aria-checked={on} data-testid={`${testid}-${o.v || 'all'}`}
            onClick={() => onChange(o.v)}
            className="ip-focus min-h-11 flex-1 rounded-md px-3 text-sm font-semibold whitespace-nowrap transition-colors"
            style={on ? { background: c, color: 'white' } : { color: o.color && o.v ? c : 'var(--navy)' }}>
            {o.color && o.v && !on && <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const selCls = 'ip-focus min-h-11 w-full appearance-none rounded-lg border bg-white pl-3 pr-8 text-sm font-semibold hover:border-[color:var(--navy)]';
const FieldLabel = ({ children }: { children: string }) => (
  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{children}</span>
);

export function FinderControls({ f }: { f: SessionFinder }) {
  const [open, setOpen] = useState(false);
  const { state, grouped } = f;
  const typeOpts = grouped ? (state.kind ? [{ k: state.kind, list: grouped[state.kind] }]
    : [{ k: 'case', list: grouped.case }, { k: 'behavioral', list: grouped.behavioral }]) : [];
  return (
    <section aria-label="Find sessions" className="ip-rise mt-8 rounded-xl p-3 sm:p-4" style={{ background: 'var(--panel)' }}>
      <div className="flex flex-col gap-2">
        <label className="relative block flex-1 min-w-0">
          <span className="sr-only">Search prompts and notes</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" data-testid="input-search" value={f.text} onChange={e => f.setSearch(e.target.value)}
            placeholder="Search prompts and notes"
            className="ip-focus block w-full min-h-11 rounded-lg border bg-white pl-10 pr-3 text-base hover:border-[color:var(--navy)]" />
        </label>
        <button type="button" data-testid="button-toggle-filters" aria-expanded={open} aria-controls="finder-filters"
          onClick={() => setOpen(o => !o)}
          className="ip-focus lg:hidden self-end min-h-11 shrink-0 rounded-lg border bg-white px-3 inline-flex items-center gap-1.5 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />Filters{f.filterCount > 0 ? ` (${f.filterCount})` : ''}
        </button>
      </div>
      <div id="finder-filters" className={`${open ? 'grid' : 'hidden'} mt-3 gap-3 lg:flex lg:flex-nowrap lg:items-end lg:gap-3`}>
        <div className="min-w-0"><FieldLabel>Kind</FieldLabel>
          <Seg label="Kind" testid="filter-kind" value={state.kind} options={KINDS} onChange={f.setKind} /></div>
        <label className="block min-w-0 lg:flex-1 lg:max-w-[220px]"><FieldLabel>Question type</FieldLabel>
          <span className="relative block">
            <select data-testid="select-filter-type" className={selCls} disabled={!grouped}
              value={state.type ?? ''} onChange={e => f.update({ type: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{f.typesError ? 'Types unavailable' : grouped ? 'All types' : 'Loading types'}</option>
              {typeOpts.length === 1 ? typeOpts[0].list.map(t => <option key={t.id} value={t.id}>{t.name}{t.user_id != null ? ' (custom)' : ''}</option>)
                : typeOpts.map(g => (
                  <optgroup key={g.k} label={g.k === 'case' ? 'Case' : 'Behavioral'}>
                    {g.list.map(t => <option key={t.id} value={t.id}>{t.name}{t.user_id != null ? ' (custom)' : ''}</option>)}
                  </optgroup>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
          </span>
        </label>
        <label className="block min-w-0 lg:flex-1 lg:max-w-[200px]"><FieldLabel>Case book</FieldLabel>
          <span className="relative block">
            <select data-testid="select-filter-book" className={selCls} disabled={!f.books}
              value={state.book} onChange={e => f.update({ book: e.target.value })}>
              <option value="">{f.booksError ? 'Books unavailable' : f.books ? 'All books' : 'Loading books'}</option>
              <option value="none">{NO_BOOK}</option>
              {(f.books ?? []).map(b => <option key={b.id} value={String(b.id)}>{caseBookLabel(b.name, b.publication_year)}{b.user_id != null ? ' (custom)' : ''}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
          </span>
        </label>
        <div className="min-w-0"><FieldLabel>Score</FieldLabel>
          <Seg label="Score" testid="filter-score" value={state.score} options={SCORES} onChange={score => f.update({ score })} /></div>
        <label className="block min-w-0 lg:ml-auto lg:w-[150px] lg:shrink-0"><FieldLabel>Sort</FieldLabel>
          <span className="relative block">
            <select data-testid="select-sort" className={selCls} value={state.sort}
              onChange={e => f.update({ sort: e.target.value as ListSessionsSort })}>
              {SORTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
          </span>
        </label>
      </div>
    </section>
  );
}

export function ClearFilters({ f, solid }: { f: SessionFinder; solid?: boolean }) {
  return (
    <button type="button" data-testid={solid ? 'button-clear-filters-empty' : 'button-clear-filters'} onClick={f.clear}
      className={`ip-focus min-h-11 rounded-lg px-4 inline-flex items-center gap-1.5 text-sm font-semibold ${solid ? 'text-white' : 'border bg-white'}`}
      style={solid ? { background: 'var(--navy)' } : undefined}>
      <X className="h-4 w-4" aria-hidden />Clear filters
    </button>
  );
}
