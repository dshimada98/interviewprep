export const scoreLevelNames = ['Needs rescue', 'Below bar', 'At bar', 'Strong', 'Offer-level'];

export const sectionSubtitles = {
  Introduction: 'Clarifying, restating the objective',
  Framework: 'Structure tailored to the case',
  Exhibits: 'Reading charts, finding the so-what',
  Math: 'Setup, execution, sanity checks',
  Brainstorm: 'Structured, creative idea generation',
  Recommendation: 'Answer-first synthesis',
  'Driving the case forward': 'Hypothesis, key questions, moving the case forward',
  Delivery: 'Concise, confident, signposted communication',
};

// Indexed by score minus one. Seeding never overwrites defaults or private edits.
export const rubricDefaults = {
  Introduction: [
    'Jumped in without clarifying.',
    "Some clarifying, but the objective isn't restated or confirmed.",
    'Restates the objective and asks 2-3 relevant questions.',
    'Crisp restatement including the success metric.',
    'Crisp restatement with success metric; questions uncover something that shapes the whole approach.',
  ],
  Framework: [
    'Framework missing or generic.',
    'Framework is a memorized template with little tailoring.',
    'MECE framework with some case-specific buckets.',
    'Tailored MECE framework walked top-down with a prioritized starting point.',
    'Fully bespoke framework with a hypothesis per bucket; could be used to run the engagement.',
  ],
  'Driving the case forward': [
    'Waits for the interviewer to direct; no hypothesis.',
    'Asks for data without saying why; hypothesis stated once, then dropped.',
    'States a hypothesis, asks targeted questions, links each data point back to it.',
    'Updates the hypothesis as data arrives; proposes next steps unprompted.',
    'Leads like an engagement manager; prioritizes hard and anticipates the next question.',
  ],
  Brainstorm: [
    'A few unstructured ideas; stalls.',
    'Several ideas, but a flat list with overlap.',
    'Ideas grouped into 2-3 reasonably MECE buckets.',
    'Clear structure (e.g. internal/external) with several ideas per bucket, prioritized.',
    'Structured and creative: surfaces a non-obvious idea and ties ideas back to the objective.',
  ],
  Math: [
    'Wrong setup or a major error the interviewer had to fix.',
    'Right setup, but slow or with errors; approach not explained.',
    'Explains the approach first; correct, with any slip self-caught.',
    'Clean, quick, organized on paper; sanity-checks the result.',
    'Fast, error-free, smart shortcuts; states the so-what of the number immediately.',
  ],
  Exhibits: [
    'Describes the chart without insight, or misreads it.',
    'Finds the obvious point only after prompting.',
    'Orients (title, axes, units) and identifies the main insight.',
    'Finds the key insight quickly plus a secondary one; links to the hypothesis.',
    'Pulls the insight and its implication for the recommendation unprompted; spots anomalies.',
  ],
  Recommendation: [
    'Recaps the case chronologically; no clear answer.',
    "Gives an answer, but it's buried or hedged.",
    'Answer first with 2-3 supporting reasons.',
    'Answer first, quantified reasons, risks, and next steps in about 60 seconds.',
    'CEO-ready: decisive, quantified, concise, delivered without reading notes.',
  ],
  Delivery: [
    'Rambles or long silences; hard to follow.',
    'Understandable but unstructured; filler words, low confidence.',
    'Clear and signposted most of the time; steady pace.',
    'Concise and confident throughout; engages the interviewer.',
    'Executive presence; composed under pushback, conversational, easy to follow.',
  ],
  behavioral_overall: [
    'No clear story; rambles or never reaches a result.',
    'Story is there, but vague about my own actions or the result.',
    'Clear STAR structure with my own actions and a result.',
    'Concise, specific actions, quantified result, clearly answers the question asked.',
    'Compelling and concise; quantified impact, reflection on what I learned, tailored to the firm.',
  ],
};
