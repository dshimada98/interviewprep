import { getGetSessionQueryKey, getListSessionsQueryKey } from '@workspace/api-client-react';

export const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : undefined);
export const listKey = (uid?: number) => [...getListSessionsQueryKey(), uid] as const;
export const starredKey = (uid?: number) => [...getListSessionsQueryKey({ starred: true }), uid] as const;
export const detailKey = (id: number, uid?: number) => [...getGetSessionQueryKey(id), uid] as const;
