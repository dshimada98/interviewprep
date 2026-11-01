export function caseBookLabel(name: string, year?: number | null) {
  return year == null ? name : `${name} (${year})`;
}
