import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { createCaseBook, useCreateCaseBook, useGetCaseBooks, type CaseBook, type CaseBookList } from '@workspace/api-client-react';
import { authRequest, sessionRequestOptions, useAuth } from '@/auth';
import { caseBooksKey, statusOf } from './session-keys';
import { isCustom } from './category-select';
import { groupBookNames, normBookName } from './case-book-name';

const ADD_BOOK = '__add_book__';
const GENERIC = "Couldn't add that case book. Please try again.";
export const NO_BOOK = 'No book / live case';

/** Shared alphabetically, then the user's own alphabetically. Mirrors the server ordering. */
function sortBooks(list: CaseBook[]) {
  return [...list].sort((a, b) => Number(isCustom(a)) - Number(isCustom(b)) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    || (b.publication_year ?? 0) - (a.publication_year ?? 0));
}

function errMessage(e: unknown) {
  if (e && typeof e === 'object' && 'data' in e) {
    const d = (e as { data?: { errors?: Record<string, unknown>; message?: unknown } | null }).data;
    const n = d?.errors?.name ?? d?.errors?.publication_year;
    if (typeof n === 'string' && n) return n;
    if (statusOf(e) === 401) return 'Please sign in again in another tab, then try saving this case book again. Your draft is still here.';
    if (typeof d?.message === 'string' && d.message) return d.message;
  }
  return GENERIC;
}

export function useCaseBooks() {
  const { user } = useAuth();
  return useGetCaseBooks({
    query: { queryKey: caseBooksKey(user?.id), enabled: !!user, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
}

type Props = {
  id: string; value: string; onChange: (v: string, name: string | null) => void; knownName?: string; onAddingChange?: (adding: boolean) => void;
  disabled?: boolean; className: string; invalid?: boolean; describedBy?: string; style?: CSSProperties;
};

export function CaseBookSelect({ id, value, knownName, onChange, onAddingChange, disabled, className, invalid, describedBy, style }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const books = useCaseBooks();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // A just-created book stays selectable before the refetched list includes it.
  const [extra, setExtra] = useState<CaseBook | null>(null);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const cbRef = useRef(onAddingChange);
  cbRef.current = onAddingChange;
  useEffect(() => { cbRef.current?.(adding); }, [adding]);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);
  const create = useCreateCaseBook({
    mutation: {
      mutationFn: async ({ data }) => {
        // Read the token at click time; refresh and retry once only on a CSRF rejection.
        try {
          return await createCaseBook(data, sessionRequestOptions());
        } catch (error) {
          if (statusOf(error) !== 403) throw error;
          const status = await authRequest('status');
          if (!status.user) throw error;
          return createCaseBook(data, sessionRequestOptions());
        }
      },
    },
  });

  function close() { setAdding(false); setName(''); setErr(''); requestAnimationFrame(() => selectRef.current?.focus()); }

  function save() {
    if (create.isPending) return;
    setErr('');
    create.mutate({ data: { name, publication_year: null } }, {
      onSuccess: b => {
        qc.setQueryData<CaseBookList>(caseBooksKey(user?.id), old => old && !old.books.some(x => x.id === b.id)
          ? { ...old, books: sortBooks([...old.books, b]) } : old);
        void qc.invalidateQueries({ queryKey: caseBooksKey(user?.id), exact: true });
        setExtra(b);
        onChange(String(b.id), b.name);
        setAdding(false); setName('');
        requestAnimationFrame(() => selectRef.current?.focus());
      },
      onError: e => setErr(errMessage(e)),
    });
  }

  if (books.isLoading) return <div className="ip-skel h-11 rounded-lg" aria-busy="true"><span className="sr-only">Loading case books</span></div>;
  if (books.error && !books.data) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm font-medium" style={{ color: '#C0392B' }} data-testid="text-case-books-error">Unable to load case books.</p>
        <button type="button" data-testid="button-retry-case-books" onClick={() => void books.refetch()} disabled={books.isFetching}
          className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold">{books.isFetching ? 'Retrying...' : 'Retry'}</button>
      </div>
    );
  }
  const list = books.data?.books ?? [];
  // Keep a saved book visible even if it no longer appears in the list.
  const all = extra && !list.some(b => b.id === extra.id) ? [...list, extra] : list;
  const groups = groupBookNames(all);
  const current = all.find(b => String(b.id) === value);
  // Display by normalized name; the original edition id is kept by the parent for submission.
  const curKey = current ? normBookName(current.name) : value && knownName ? normBookName(knownName) : '';
  const missing = !!value && !groups.some(g => g.key === curKey);
  const selValue = !value ? '' : `n:${curKey}`;
  const errId = `${id}-add-err`;
  return (
    <div className="space-y-2 min-w-0">
      <select ref={selectRef} id={id} data-testid="select-case-book" className={className} style={style} disabled={disabled || adding}
        aria-invalid={invalid} aria-describedby={describedBy} value={selValue}
        onChange={e => { if (e.target.value === ADD_BOOK) { setAdding(true); setErr(''); } else if (!e.target.value) onChange('', null);
          else { const k = e.target.value.slice(2); if (k === curKey) return; const g = groups.find(x => x.key === k); if (g) onChange(String(g.rep.id), g.name); } }}>
        <option value="">{NO_BOOK}</option>
        {missing && <option value={selValue}>{knownName?.trim() || 'Saved case book'}</option>}
        {groups.map(g => <option key={g.key} value={`n:${g.key}`}>{g.name}</option>)}
        <option value={ADD_BOOK}>+ Add your own case book</option>
      </select>
      {adding && (
        <div className="ip-rise rounded-lg border bg-white p-3 space-y-2" style={{ borderColor: 'var(--navy)' }} data-testid="panel-add-case-book">
          <label htmlFor={`${id}-new`} className="block text-sm font-semibold">New case book name</label>
          <input ref={inputRef} id={`${id}-new`} data-testid="input-new-case-book" value={name} maxLength={200}
            placeholder="LBS Casebook" disabled={create.isPending}
            aria-invalid={!!err} aria-describedby={err ? errId : undefined}
            className="ip-focus block w-full min-w-0 min-h-11 rounded-lg border bg-white px-3.5 text-base"
            style={{ borderColor: err ? '#C0392B' : undefined }}
            onChange={e => { setName(e.target.value); if (err) setErr(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); save(); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!create.isPending) close(); }
            }} />
          {err && <p id={errId} role="alert" className="text-sm font-medium" style={{ color: '#C0392B' }} data-testid="text-case-book-error">{err}</p>}
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2">
            <button type="button" data-testid="button-cancel-case-book" disabled={create.isPending} onClick={close}
              className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold disabled:opacity-60">Cancel</button>
            <button type="button" data-testid="button-save-case-book" disabled={create.isPending} onClick={save}
              className="ip-focus min-h-11 px-4 rounded-lg font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-70"
              style={{ background: 'var(--navy)' }}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{create.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
