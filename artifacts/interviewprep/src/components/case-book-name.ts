import type { CaseBook } from '@workspace/api-client-react';

/** Case-insensitive, whitespace-collapsed key used to show each book name once. */
export const normBookName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export type BookNameGroup = { key: string; name: string; rep: CaseBook };

/** One entry per normalized name; shared editions represent the group before owned ones. */
export function groupBookNames(list: CaseBook[]): BookNameGroup[] {
  const map = new Map<string, BookNameGroup>();
  for (const b of list) {
    const key = normBookName(b.name);
    const cur = map.get(key);
    if (!cur || (cur.rep.user_id != null && b.user_id == null)) map.set(key, { key, name: b.name.trim().replace(/\s+/g, ' '), rep: b });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export const maxEditionYear = () => new Date().getFullYear() + 1;
export const yearMessage = () => `Please enter a four-digit year between 1990 and ${maxEditionYear()}.`;
/** Returns an error message, or null when blank or valid. */
export function editionYearError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{4}$/.test(v) || Number(v) < 1990 || Number(v) > maxEditionYear()) return yearMessage();
  return null;
}
