import type { Query, QueryClient } from '@tanstack/react-query';
import { getGetDashboardQueryKey, getGetSessionQueryKey, getListSessionsQueryKey, type ListSessionsParams, type SessionList } from '@workspace/api-client-react';

export const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : undefined);

/** Drop undefined entries so equal filters always produce equal keys. User id stays the last key item. */
export function cleanParams(p?: ListSessionsParams): ListSessionsParams | undefined {
  if (!p) return undefined;
  const out = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '')) as ListSessionsParams;
  return Object.keys(out).length ? out : undefined;
}
export const listKey = (uid?: number, params?: ListSessionsParams) => [...getListSessionsQueryKey(cleanParams(params)), uid] as const;
export const starredKey = (uid?: number) => listKey(uid, { starred: true });
export const detailKey = (id: number, uid?: number) => [...getGetSessionQueryKey(id), uid] as const;

const LIST_ROOT = getListSessionsQueryKey()[0];
/** Matches every list variant (any search/filter/sort/starred) for one user. */
export const isListQuery = (uid?: number) => (q: Query) => {
  const k = q.queryKey;
  return k[0] === LIST_ROOT && k.at(-1) === uid && (k.length === 2 || (k.length === 3 && typeof k[1] === 'object'));
};
export const paramsOfKey = (k: readonly unknown[]): ListSessionsParams => (k.length === 3 ? (k[1] as ListSessionsParams) : {});

export const dashboardKey = (uid?: number) => [...getGetDashboardQueryKey(), uid] as const;
/** Session create/edit/delete changes list results and dashboard aggregates. Star toggles do not touch the dashboard. */
export const invalidateLists = (qc: QueryClient, uid?: number, opts: { dashboard?: boolean } = {}) => Promise.all([
  qc.invalidateQueries({ predicate: isListQuery(uid) }),
  opts.dashboard === false ? undefined : qc.invalidateQueries({ queryKey: dashboardKey(uid), exact: true }),
]);

/** Remove a deleted session from every cached envelope for the user. */
export function removeFromLists(qc: QueryClient, uid: number | undefined, id: number) {
  for (const [key, old] of qc.getQueriesData<SessionList>({ predicate: isListQuery(uid) })) {
    if (!old) continue;
    // total is the unfiltered owned count, so it drops for every variant.
    qc.setQueryData<SessionList>(key, { sessions: old.sessions.filter(s => s.id !== id), total: Math.max(0, old.total - 1) });
  }
}
