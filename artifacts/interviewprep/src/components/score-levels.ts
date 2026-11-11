/** Single source of truth for score level names across the client. */
export const LEVEL_NAMES = ['', 'Needs rescue', 'Below bar', 'At bar', 'Strong', 'Offer-level'] as const;
export const levelName = (n: number) => LEVEL_NAMES[Math.min(5, Math.max(1, Math.round(n)))];
export const CALIBRATION_TIPS = [
  'If a partner or interviewer scored you, use their number and note yours in the feedback if it differs.',
  "A 5 should be rare. If most scores are 4-5, you're grading on effort; re-read the 3 and 4 columns.",
  'Score each skill on its weakest moment that mattered, not its average moment.',
] as const;
export const BEHAVIORAL_SCOPE = 'behavioral_overall';
