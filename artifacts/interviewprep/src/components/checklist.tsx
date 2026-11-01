import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  clearCompletedChecklist, createChecklistItem, deleteChecklistItem, getGetChecklistQueryKey, updateChecklistItem,
  useClearCompletedChecklist, useCreateChecklistItem, useDeleteChecklistItem, useGetChecklist, useUpdateChecklistItem,
  type ChecklistItem, type ChecklistList,
} from '@workspace/api-client-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { authRequest, sessionRequestOptions, useAuth } from '@/auth';
import { statusOf } from './session-keys';
import { useCaseSections } from './case-sections-query';

const MAX = 200;
export const checklistKey = (uid?: number) => [...getGetChecklistQueryKey(), uid] as const;
const BLANK_MSG = 'Please write what you want to work on.';
const LONG_MSG = 'Please keep it under 200 characters.';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${day}`; };

/** Reads the CSRF token at call time; on a 403 refreshes it once and retries. */
async function withCsrf<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (statusOf(e) !== 403) throw e;
    const s = await authRequest('status');
    if (!s.user) throw e;
    return fn();
  }
}

function errMsg(e: unknown, fallback: string) {
  const st = statusOf(e);
  if (st === 401) return 'Your session expired. Sign in again in another tab, then retry. Your text is still here.';
  if (st === 404) return 'That item or session no longer exists. Refresh and try again.';
  if (e && typeof e === 'object' && 'data' in e) {
    const d = (e as { data?: { errors?: Record<string, unknown>; message?: unknown } | null }).data;
    const t = d?.errors?.text ?? Object.values(d?.errors ?? {}).find(v => typeof v === 'string');
    if (typeof t === 'string' && t) return t;
    if (st === 400 && typeof d?.message === 'string' && d.message) return d.message;
  }
  return fallback;
}

export function useChecklist() {
  const { user, refresh } = useAuth();
  const q = useGetChecklist({
    query: { queryKey: checklistKey(user?.id), enabled: !!user, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  useEffect(() => { if (statusOf(q.error) === 401) void refresh(); }, [q.error, refresh]);
  return q;
}

function useInvalidate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return () => qc.invalidateQueries({ queryKey: checklistKey(user?.id), exact: true });
}

/* ---------------- One-tap add from a note ---------------- */

export function AddNoteButton({ sessionId, sectionId, label }: { sessionId: number; sectionId: number | null; label?: string }) {
  const q = useChecklist();
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [err, setErr] = useState('');
  const create = useCreateChecklistItem({
    mutation: { mutationFn: ({ data }) => withCsrf(() => createChecklistItem(data, sessionRequestOptions())) },
  });
  const tid = `${sessionId}-${sectionId ?? 'overall'}`;
  const on = q.data?.note_keys.some(k => k.source_session_id === sessionId && k.section_id === sectionId);

  if (on) {
    return (
      <span className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--green-text)' }}
        data-testid={`status-on-checklist-${tid}`}>
        <Check className="h-4 w-4" aria-hidden />On checklist
      </span>
    );
  }
  function add() {
    setErr('');
    create.mutate({ data: { source_session_id: sessionId, section_id: sectionId } }, {
      onSuccess: item => {
        qc.setQueryData<ChecklistList>(checklistKey(user?.id), old => old && !old.note_keys.some(k => k.source_session_id === sessionId && k.section_id === sectionId)
          ? { ...old, note_keys: [...old.note_keys, { source_session_id: sessionId, section_id: sectionId }], open: item.done || old.open.some(x => x.id === item.id) ? old.open : [item, ...old.open] }
          : old);
        void invalidate();
      },
      onError: e => {
        const m = errMsg(e, "Couldn't add this note. Please try again.");
        setErr(m === LONG_MSG ? 'This note is over 200 characters. Add a shorter version by hand in the checklist on your dashboard.' : m === BLANK_MSG ? 'This note is empty, so there is nothing to add.' : m);
      },
    });
  }
  return (
    <div className="mt-2">
      <button type="button" onClick={add} disabled={create.isPending || q.isLoading} data-testid={`button-add-checklist-${tid}`}
        aria-label={label ? `Add to checklist: ${label}` : undefined}
        className="ip-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold hover:border-[color:var(--navy)] disabled:opacity-60">
        {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
        {create.isPending ? 'Adding...' : 'Add to checklist'}
      </button>
      {err && <p role="alert" className="mt-1 flex items-start gap-1.5 text-xs font-medium" style={{ color: '#C0392B' }} data-testid={`text-add-checklist-error-${tid}`}>
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />{err}</p>}
    </div>
  );
}

/* ---------------- Dashboard card ---------------- */

function moveItem(old: ChecklistList, id: number, done: boolean): ChecklistList {
  const item = [...old.open, ...old.completed].find(x => x.id === id);
  if (!item || item.done === done) return old;
  const next: ChecklistItem = { ...item, done, done_at: done ? new Date().toISOString() : null };
  const open = old.open.filter(x => x.id !== id);
  const completed = old.completed.filter(x => x.id !== id);
  return done
    ? { ...old, open, completed: [next, ...completed].slice(0, 10), completed_count: old.completed_count + 1 }
    : { ...old, open: [next, ...open].sort((a, b) => b.created_at.localeCompare(a.created_at)), completed, completed_count: Math.max(0, old.completed_count - 1) };
}

export function ChecklistCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = checklistKey(user?.id);
  const q = useChecklist();
  const sections = useCaseSections();
  const invalidate = useInvalidate();
  const [text, setText] = useState('');
  const [sec, setSec] = useState('');
  const [addErr, setAddErr] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [rowErr, setRowErr] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearErr, setClearErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const create = useCreateChecklistItem({ mutation: { mutationFn: ({ data }) => withCsrf(() => createChecklistItem(data, sessionRequestOptions())) } });
  const update = useUpdateChecklistItem({ mutation: { mutationFn: ({ id, data }) => withCsrf(() => updateChecklistItem(id, data, sessionRequestOptions())) } });
  const del = useDeleteChecklistItem({ mutation: { mutationFn: ({ id }) => withCsrf(() => deleteChecklistItem(id, sessionRequestOptions())) } });
  const clear = useClearCompletedChecklist({ mutation: { mutationFn: () => withCsrf(() => clearCompletedChecklist(sessionRequestOptions())) } });

  const setRow = (id: number, m: string) => setRowErr(p => { const n = { ...p }; if (m) n[id] = m; else delete n[id]; return n; });
  const setBusyId = (id: number, b: boolean) => setBusy(p => { const n = { ...p }; if (b) n[id] = true; else delete n[id]; return n; });

  function add(e?: FormEvent) {
    e?.preventDefault();
    if (create.isPending) return;
    const t = text.trim();
    if (!t) { setAddErr(BLANK_MSG); inputRef.current?.focus(); return; }
    if (t.length > MAX) { setAddErr(LONG_MSG); inputRef.current?.focus(); return; }
    setAddErr('');
    create.mutate({ data: { text: t, section_id: sec ? Number(sec) : null } }, {
      onSuccess: item => {
        qc.setQueryData<ChecklistList>(key, old => old && !old.open.some(x => x.id === item.id) ? { ...old, open: [item, ...old.open] } : old);
        setText(''); setSec(''); void invalidate(); inputRef.current?.focus();
      },
      onError: er => setAddErr(errMsg(er, "Couldn't add that. Please try again.")),
    });
  }

  async function toggle(item: ChecklistItem) {
    if (busy[item.id]) return;
    const done = !item.done;
    setRow(item.id, ''); setBusyId(item.id, true);
    await qc.cancelQueries({ queryKey: key, exact: true });
    qc.setQueryData<ChecklistList>(key, old => old && moveItem(old, item.id, done));
    update.mutate({ id: item.id, data: { done } }, {
      onSuccess: () => void invalidate(),
      onError: er => {
        qc.setQueryData<ChecklistList>(key, old => {
          if (!old) return old;
          const reverted = moveItem(old, item.id, !done);
          return { ...reverted,
            open: reverted.open.map(x => x.id === item.id ? item : x),
            completed: reverted.completed.map(x => x.id === item.id ? item : x)
              .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')),
          };
        });
        setRow(item.id, statusOf(er) === 404 ? 'This item no longer exists.' : `Couldn't save. "${item.text.slice(0, 40)}${item.text.length > 40 ? '...' : ''}" was ${done ? 'unticked' : 'ticked'} again. Please try again.`);
        void invalidate();
      },
      onSettled: () => setBusyId(item.id, false),
    });
  }

  function remove(item: ChecklistItem) {
    if (busy[item.id]) return;
    setRow(item.id, ''); setBusyId(item.id, true);
    del.mutate({ id: item.id }, {
      onSuccess: () => {
        qc.setQueryData<ChecklistList>(key, old => old && {
          ...old, open: old.open.filter(x => x.id !== item.id), completed: old.completed.filter(x => x.id !== item.id),
          completed_count: item.done ? Math.max(0, old.completed_count - 1) : old.completed_count,
        });
        void invalidate();
      },
      onError: er => { if (statusOf(er) === 404) void invalidate(); else setRow(item.id, "Couldn't delete this item. Please try again."); },
      onSettled: () => setBusyId(item.id, false),
    });
  }

  function saveText(item: ChecklistItem, t: string, done: () => void, fail: (m: string) => void) {
    const v = t.trim();
    if (!v) return fail(BLANK_MSG);
    if (v.length > MAX) return fail(LONG_MSG);
    setBusyId(item.id, true);
    update.mutate({ id: item.id, data: { text: v } }, {
      onSuccess: saved => {
        qc.setQueryData<ChecklistList>(key, old => old && {
          ...old, open: old.open.map(x => x.id === saved.id ? saved : x), completed: old.completed.map(x => x.id === saved.id ? saved : x),
        });
        void invalidate(); done();
      },
      onError: er => fail(errMsg(er, "Couldn't save your edit. Please try again.")),
      onSettled: () => setBusyId(item.id, false),
    });
  }

  function doClear() {
    setClearErr('');
    clear.mutate(undefined, {
      onSuccess: () => {
        qc.setQueryData<ChecklistList>(key, old => old && { ...old, completed: [], completed_count: 0 });
        void invalidate(); setConfirmClear(false);
      },
      onError: () => { setConfirmClear(false); setClearErr("Couldn't clear completed items. Please try again."); },
    });
  }

  const d = q.data;
  const secList = [...(sections.data ?? [])].sort((a, b) => a.display_order - b.display_order);
  const rowProps = { busy, rowErr, onToggle: toggle, onDelete: remove, onSave: saveText };

  return (
    <section aria-labelledby="h-checklist" className="ip-rise min-w-0 rounded-xl border-l-4 bg-white p-5 sm:p-6"
      style={{ borderColor: 'var(--green)' }} data-testid="card-checklist">
      <h2 id="h-checklist" className="text-lg font-bold tracking-tight">Before your next case</h2>

      <form onSubmit={add} className="mt-4 flex flex-col sm:flex-row gap-2" noValidate>
        <label htmlFor="checklist-new" className="sr-only">Add something to work on</label>
        <input ref={inputRef} id="checklist-new" data-testid="input-checklist-text" value={text} disabled={create.isPending}
          placeholder="Add something to work on…" aria-invalid={!!addErr} aria-describedby={addErr ? 'checklist-add-err' : 'checklist-count'}
          onChange={e => { setText(e.target.value); if (addErr) setAddErr(''); }}
          className="ip-focus min-w-0 flex-1 min-h-11 rounded-lg border bg-white px-3.5 text-base hover:border-[color:var(--navy)]"
          style={{ borderColor: addErr ? '#C0392B' : undefined }} />
        <label htmlFor="checklist-section" className="sr-only">Case section (optional)</label>
        <select id="checklist-section" data-testid="select-checklist-section" value={sec} onChange={e => setSec(e.target.value)} disabled={create.isPending}
          className="ip-focus min-h-11 rounded-lg border bg-white px-3 text-base sm:w-48">
          <option value="">No section</option>
          {secList.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </select>
        <button type="submit" data-testid="button-add-checklist" disabled={create.isPending}
          className="ip-focus min-h-11 px-5 rounded-lg inline-flex items-center justify-center gap-2 font-semibold text-white disabled:opacity-70"
          style={{ background: 'var(--navy)' }}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}Add
        </button>
      </form>
      <div className="mt-1 flex justify-between gap-3 text-xs">
        {addErr ? <p id="checklist-add-err" role="alert" className="font-medium" style={{ color: '#C0392B' }} data-testid="text-checklist-add-error">{addErr}</p> : <span />}
        <span id="checklist-count" className={`tabular-nums ${text.trim().length > MAX ? 'font-semibold' : 'text-muted-foreground'}`} style={text.trim().length > MAX ? { color: '#C0392B' } : undefined}>{text.trim().length}/{MAX}</span>
      </div>

      {q.isLoading ? (
        <div className="mt-4 space-y-2" aria-busy="true"><span className="sr-only" role="status">Loading your checklist</span>
          {[0, 1, 2].map(i => <div key={i} className="ip-skel h-12 rounded-lg" />)}
        </div>
      ) : q.error && !d ? (
        <div className="mt-4 rounded-lg border-l-4 p-4 space-y-3" style={{ borderColor: 'var(--score-1)', background: 'var(--panel)' }} data-testid="status-checklist-error">
          <p role="alert" className="flex items-start gap-2 text-sm font-medium" style={{ color: 'var(--score-1)' }}><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />Unable to load your checklist.</p>
          <button type="button" data-testid="button-retry-checklist" disabled={q.isFetching} onClick={() => void q.refetch()}
            className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold disabled:opacity-60">{q.isFetching ? 'Retrying...' : 'Retry'}</button>
        </div>
      ) : d ? (
        <>
          {d.open.length === 0 ? (
            <p className="mt-4 rounded-lg p-4 text-sm text-muted-foreground" style={{ background: 'var(--panel)' }} data-testid="text-checklist-empty">
              Nothing on your list. Add something to work on, or add a 'to improve' note from a session.
            </p>
          ) : (
            <ul className="mt-3 divide-y" aria-label="Open checklist items">
              {d.open.map(it => <Row key={it.id} item={it} {...rowProps} />)}
            </ul>
          )}

          {d.completed_count > 0 && (
            <div className="mt-4 border-t pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" aria-expanded={showDone} aria-controls="checklist-completed" onClick={() => setShowDone(o => !o)} data-testid="button-toggle-completed"
                  className="ip-focus min-h-11 inline-flex items-center gap-1.5 rounded px-1 text-sm font-semibold">
                  {showDone ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                  Completed (<span className="tabular-nums" data-testid="text-completed-count">{d.completed_count}</span>)
                </button>
                {showDone && (
                  <button type="button" onClick={() => { setClearErr(''); setConfirmClear(true); }} data-testid="button-clear-completed"
                    className="ip-focus min-h-11 px-3 rounded-lg border bg-white text-sm font-semibold" style={{ color: 'var(--score-1)', borderColor: 'var(--score-1)' }}>
                    Clear completed
                  </button>
                )}
              </div>
              {clearErr && <p role="alert" className="mt-1 text-sm font-medium" style={{ color: '#C0392B' }} data-testid="text-clear-error">{clearErr}</p>}
              {showDone && (
                <div id="checklist-completed">
                  {d.completed_count > d.completed.length && <p className="mt-1 text-xs text-muted-foreground" data-testid="text-completed-recent">Showing the {d.completed.length} most recent.</p>}
                  <ul className="mt-1 divide-y" aria-label="Completed checklist items">
                    {d.completed.map(it => <Row key={it.id} item={it} {...rowProps} />)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      <AlertDialog open={confirmClear} onOpenChange={o => { if (!clear.isPending) setConfirmClear(o); }}>
        <AlertDialogContent className="rounded-xl" style={{ color: 'var(--navy)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all completed items?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes all {d?.completed_count ?? 0} completed items, including older ones not shown. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="ip-focus min-h-11 mt-0" disabled={clear.isPending} data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={clear.isPending} onClick={e => { e.preventDefault(); doClear(); }} data-testid="button-confirm-clear"
              className="ip-focus min-h-11 text-white inline-flex items-center gap-2" style={{ background: 'var(--score-1)' }}>
              {clear.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{clear.isPending ? 'Clearing...' : 'Clear completed'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Row({ item, busy, rowErr, onToggle, onDelete, onSave }: {
  item: ChecklistItem; busy: Record<number, boolean>; rowErr: Record<number, string>;
  onToggle: (i: ChecklistItem) => void; onDelete: (i: ChecklistItem) => void;
  onSave: (i: ChecklistItem, t: string, done: () => void, fail: (m: string) => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editErr, setEditErr] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const editBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);
  const b = !!busy[item.id];
  const cbId = `checklist-cb-${item.id}`;
  const close = () => { setEditing(false); setEditErr(''); requestAnimationFrame(() => editBtn.current?.focus()); };

  return (
    <li className="py-1.5" data-testid={`row-checklist-${item.id}`}>
      <div className="flex items-start gap-2">
        <button type="button" role="checkbox" aria-checked={item.done} aria-labelledby={`${cbId}-t`} id={cbId} disabled={b && !editing}
          onClick={() => onToggle(item)} data-testid={`checkbox-checklist-${item.id}`}
          className="ip-focus group shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-60">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors group-hover:border-[color:var(--green)]"
            style={item.done ? { background: 'var(--green)', borderColor: 'var(--green)', color: 'white' } : { borderColor: 'var(--navy)', background: 'white' }}>
            {item.done && <Check className="h-4 w-4" strokeWidth={3} aria-hidden />}
          </span>
        </button>
        <div className="min-w-0 flex-1 py-2.5">
          {editing ? (
            <form onSubmit={e => { e.preventDefault(); setEditErr(''); onSave(item, draft, close, setEditErr); }} className="space-y-1.5">
              <label htmlFor={`edit-${item.id}`} className="sr-only">Edit item text</label>
              <input ref={editRef} id={`edit-${item.id}`} value={draft} disabled={b} data-testid={`input-edit-checklist-${item.id}`}
                aria-invalid={!!editErr} aria-describedby={editErr ? `edit-err-${item.id}` : undefined}
                onChange={e => { setDraft(e.target.value); if (editErr) setEditErr(''); }}
                onKeyDown={e => { if (e.key === 'Escape' && !b) { e.preventDefault(); close(); } }}
                className="ip-focus block w-full min-h-11 rounded-lg border bg-white px-3 text-base" style={{ borderColor: editErr ? '#C0392B' : undefined }} />
              {editErr && <p id={`edit-err-${item.id}`} role="alert" className="text-xs font-medium" style={{ color: '#C0392B' }}>{editErr}</p>}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={b} data-testid={`button-save-edit-${item.id}`} className="ip-focus min-h-11 px-4 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-70" style={{ background: 'var(--navy)' }}>
                  {b && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Save</button>
                <button type="button" disabled={b} onClick={close} data-testid={`button-cancel-edit-${item.id}`} className="ip-focus min-h-11 px-4 rounded-lg border bg-white text-sm font-semibold">Cancel</button>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{draft.trim().length}/{MAX}</span>
              </div>
            </form>
          ) : (
            <p id={`${cbId}-t`} className={`text-sm leading-snug break-words [overflow-wrap:anywhere] ${item.done ? 'line-through text-muted-foreground' : 'font-medium'}`} data-testid={`text-checklist-${item.id}`}>
              {item.text}
            </p>
          )}
          {(item.section_name || item.from_note) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {item.section_name && <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: 'var(--panel)' }} data-testid={`chip-section-${item.id}`}>{item.section_name}</span>}
              {item.from_note && (item.source_session_id != null && item.source_session_date ? (
                <Link href={`/sessions/${item.source_session_id}`} data-testid={`link-checklist-source-${item.id}`}
                  title={item.source_session_prompt ?? undefined}
                  className="ip-focus inline-flex min-h-6 max-w-full items-center rounded font-medium text-muted-foreground underline underline-offset-2 decoration-[color:var(--green)] hover:text-[color:var(--navy)] break-words [overflow-wrap:anywhere]">
                  from {shortDate(item.source_session_date)} · {item.source_session_prompt}
                </Link>
              ) : <span className="text-muted-foreground italic" data-testid={`text-checklist-source-deleted-${item.id}`}>from a deleted session</span>)}
            </div>
          )}
          {rowErr[item.id] && <p role="alert" className="mt-1 flex items-start gap-1.5 text-xs font-medium" style={{ color: '#C0392B' }} data-testid={`text-checklist-error-${item.id}`}>
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />{rowErr[item.id]}</p>}
        </div>
        {!editing && (
          <div className="flex shrink-0">
            {item.done ? (
              <button type="button" onClick={() => onToggle(item)} disabled={b} aria-label={`Restore: ${item.text}`} data-testid={`button-restore-${item.id}`}
                className="ip-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-[color:var(--navy)] disabled:opacity-50">
                <RotateCcw className="h-4 w-4" aria-hidden /></button>
            ) : (
              <button ref={editBtn} type="button" onClick={() => { setDraft(item.text); setEditErr(''); setEditing(true); }} disabled={b} aria-label={`Edit: ${item.text}`} data-testid={`button-edit-${item.id}`}
                className="ip-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-[color:var(--navy)] disabled:opacity-50">
                <Pencil className="h-4 w-4" aria-hidden /></button>
            )}
            <button type="button" onClick={() => onDelete(item)} disabled={b} aria-label={`Delete: ${item.text}`} data-testid={`button-delete-checklist-${item.id}`}
              className="ip-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-[color:var(--score-1)] disabled:opacity-50">
              {item.done ? <X className="h-4 w-4" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
