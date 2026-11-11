import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetRubricQueryKey, resetRubricScope, updateRubricEntry, useGetRubric, useResetRubricScope, useUpdateRubricEntry,
  type RubricScope,
} from '@workspace/api-client-react';
import { authRequest, sessionRequestOptions, useAuth } from '@/auth';
import { statusOf } from './session-keys';

async function withCsrf<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (statusOf(e) !== 403) throw e;
    const s = await authRequest('status');
    if (!s.user) throw e;
    return fn();
  }
}

export const rubricKey = (uid: number | undefined) => [...getGetRubricQueryKey(), uid] as const;

export function useRubric() {
  const { user, refresh } = useAuth();
  const q = useGetRubric({
    query: { queryKey: rubricKey(user?.id), enabled: !!user, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: true },
    request: sessionRequestOptions(),
  });
  useEffect(() => { if (statusOf(q.error) === 401) void refresh(); }, [q.error, refresh]);
  return q;
}

export function useRubricScope(scope: string): RubricScope | undefined {
  return useRubric().data?.scopes.find(s => s.scope === scope);
}

export function useRubricMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: rubricKey(user?.id) });
  const update = useUpdateRubricEntry({ mutation: {
    mutationFn: ({ scope, score, data }) => withCsrf(() => updateRubricEntry(scope, score, data, sessionRequestOptions())),
    onSuccess: done,
  } });
  const reset = useResetRubricScope({ mutation: {
    mutationFn: ({ scope }) => withCsrf(() => resetRubricScope(scope, sessionRequestOptions())),
    onSuccess: done,
  } });
  return { update, reset };
}

/** Server field error for description, else a generic message. */
export function rubricErr(e: unknown, fallback: string) {
  const st = statusOf(e);
  if (st === 400 && e && typeof e === 'object' && 'data' in e) {
    const d = (e as { data?: { errors?: Record<string, unknown>; message?: unknown } }).data;
    const m = d?.errors?.description ?? d?.message;
    if (typeof m === 'string') return m;
  }
  if (st === 401) return 'Your session expired. Please log in again.';
  return fallback;
}
