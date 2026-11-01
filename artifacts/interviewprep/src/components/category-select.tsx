import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  getGetQuestionTypesQueryKey, useCreateQuestionType,
  type GroupedQuestionTypes, type QuestionType,
} from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';
import { statusOf } from './session-keys';

export const ADD_VALUE = '__add_custom__';
const GENERIC = "Couldn't add that category. Please try again.";

export const isCustom = (t: { user_id?: number | null }) => t.user_id != null;

export function CustomTag({ on }: { on?: boolean }) {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.1em] align-middle"
      style={on ? { border: '1px solid rgba(255,255,255,0.6)', color: 'white' } : { border: '1px solid var(--green)', color: 'var(--green-text)' }}
      data-testid="tag-custom">custom</span>
  );
}

/** Shared first, custom next (both alphabetical), "Other" always last. Mirrors the server ordering. */
function sortBehavioral(list: QuestionType[]) {
  const rank = (t: QuestionType) => (t.user_id == null && t.name.trim().toLowerCase() === 'other' ? 2 : t.user_id == null ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function errMessage(e: unknown) {
  if (statusOf(e) === 400 && e && typeof e === 'object' && 'data' in e) {
    const d = (e as { data?: { errors?: Record<string, unknown> } | null }).data;
    const n = d?.errors?.name;
    if (typeof n === 'string' && n) return n;
  }
  return GENERIC;
}

type Props = {
  id: string; testid: string; value: string; options: QuestionType[]; placeholder: string;
  onChange: (v: string) => void; onAddingChange?: (adding: boolean) => void; allowAdd: boolean;
  disabled?: boolean; className: string; invalid?: boolean; describedBy?: string; style?: CSSProperties;
};

export function CategorySelect({ id, testid, value, options, placeholder, onChange, onAddingChange, allowAdd, disabled, className, invalid, describedBy, style }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const cbRef = useRef(onAddingChange);
  cbRef.current = onAddingChange;
  useEffect(() => { cbRef.current?.(adding); }, [adding]);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);
  const create = useCreateQuestionType({ request: sessionRequestOptions() });

  function close() { setAdding(false); setName(''); setErr(''); requestAnimationFrame(() => selectRef.current?.focus()); }

  function save() {
    if (create.isPending) return;
    setErr('');
    create.mutate({ data: { name } }, {
      onSuccess: t => {
        const key = [...getGetQuestionTypesQueryKey(), user?.id];
        qc.setQueryData<GroupedQuestionTypes>(key, old => old && !old.behavioral.some(x => x.id === t.id)
          ? { ...old, behavioral: sortBehavioral([...old.behavioral, t]) } : old);
        void qc.invalidateQueries({ predicate: q => q.queryKey[0] === getGetQuestionTypesQueryKey()[0] && q.queryKey.at(-1) === user?.id });
        onChange(String(t.id));
        setAdding(false); setName('');
        requestAnimationFrame(() => selectRef.current?.focus());
      },
      onError: e => setErr(errMessage(e)),
    });
  }

  const errId = `${id}-add-err`;
  return (
    <div className="space-y-2 min-w-0">
      <select ref={selectRef} id={id} data-testid={testid} className={className} style={style} disabled={disabled || adding}
        aria-invalid={invalid} aria-describedby={describedBy} value={value}
        onChange={e => { if (e.target.value === ADD_VALUE) { setAdding(true); setErr(''); } else onChange(e.target.value); }}>
        <option value="">{placeholder}</option>
        {options.map(t => <option key={t.id} value={String(t.id)}>{t.name}{isCustom(t) ? ' (custom)' : ''}</option>)}
        {allowAdd && <option value={ADD_VALUE}>+ Add your own category</option>}
      </select>
      {adding && (
        <div className="ip-rise rounded-lg border bg-white p-3 space-y-2" style={{ borderColor: 'var(--navy)' }} data-testid={`panel-add-category-${testid}`}>
          <label htmlFor={`${id}-new`} className="block text-sm font-semibold">New category name</label>
          <input ref={inputRef} id={`${id}-new`} data-testid="input-new-category" value={name} maxLength={200}
            placeholder="Stakeholder management" disabled={create.isPending}
            aria-invalid={!!err} aria-describedby={err ? errId : undefined}
            className="ip-focus block w-full min-w-0 min-h-11 rounded-lg border bg-white px-3.5 text-base"
            style={{ borderColor: err ? '#C0392B' : undefined }}
            onChange={e => { setName(e.target.value); if (err) setErr(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); save(); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!create.isPending) close(); }
            }} />
          {err && <p id={errId} role="alert" className="text-sm font-medium" style={{ color: '#C0392B' }} data-testid="text-category-error">{err}</p>}
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2">
            <button type="button" data-testid="button-cancel-category" disabled={create.isPending} onClick={close}
              className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold disabled:opacity-60">Cancel</button>
            <button type="button" data-testid="button-save-category" disabled={create.isPending} onClick={save}
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
