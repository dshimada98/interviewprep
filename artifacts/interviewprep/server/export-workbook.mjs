import ExcelJS from 'exceljs';
import { caseSectionSeeds } from './case-sections.mjs';

const NAVY = 'FF1F2A44';
const FILLS = { red: 'FFF5B7B1', amber: 'FFFAD7A0', green: 'FFABEBC6' };
const date = value => value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : null;
const text = value => value == null ? null : String(value);
const col = (name, width = 22, extra = {}) => ({ name, width, ...extra });
const dateCol = col('Date', 17, { date: true });
const scoreCol = name => col(name, 18, { score: true });
const longCol = name => col(name, 52, { wrap: true });

function scoreStyle(cell, decimals = false) {
  if (typeof cell.value !== 'number') return;
  cell.numFmt = decimals ? '0.0' : '0';
  cell.fill = { type: 'pattern', pattern: 'solid',
    fgColor: { argb: cell.value < 3 ? FILLS.red : cell.value < 4 ? FILLS.amber : FILLS.green } };
  cell.font = { name: 'Calibri', size: 11, color: { argb: NAVY } };
}
function table(sheet, columns, values, headerRow = 1) {
  columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });
  const header = sheet.getRow(headerRow);
  header.values = columns.map(c => c.name);
  header.height = 28;
  header.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${headerRow + 1}` }];
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + values.length, column: columns.length } };
  for (const valuesRow of values) {
    // Strings are deliberately assigned as scalar values, NEVER formula objects.
    const row = sheet.addRow(valuesRow);
    let lines = 1;
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.font = { name: 'Calibri', size: 11, color: { argb: NAVY } };
      cell.alignment = { vertical: 'top', wrapText: !!c.wrap };
      if (c.date && cell.value != null) cell.numFmt = 'd-mmm-yyyy';
      if (c.score) scoreStyle(cell, !!c.decimals);
      if (c.wrap && typeof cell.value === 'string') {
        lines = Math.max(lines, cell.value.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (c.width - 3))), 0));
      }
    });
    row.height = Math.min(409, Math.max(22, lines * 15));
  }
}

function summary(workbook, data, today) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = 'InterviewPrep — practice summary';
  sheet.getCell('A1').font = { name: 'Calibri', size: 19, bold: true, color: { argb: NAVY } };
  sheet.getRow(1).height = 34;
  sheet.getCell('A2').value = 'Export date';
  sheet.getCell('B2').value = date(today);
  sheet.getCell('B2').numFmt = 'd-mmm-yyyy';
  const d = data.dashboard;
  const values = [];
  if (data.sessions.length) {
    values.push(['Key stats', 'Cases logged', d.total_cases, null, null],
      ['Key stats', 'Average case score', d.average_case_score, null, null],
      ['Key stats', 'Weakest case type', text(d.weakest_case_type?.name ?? 'Not enough data yet'), null, null],
      ['Key stats', 'Behavioral sessions', d.behavioral_sessions, null, null]);
    for (const s of [...d.section_averages].filter(s => s.average_score != null)
      .sort((a, b) => Number(b.average_score) - Number(a.average_score) || a.display_order - b.display_order).slice(0, 2)) {
      values.push(['Strongest sections', s.name, Number(s.average_score), s.scored_count, null]);
    }
    for (const s of d.next_case_focus) {
      values.push(['Focus areas', s.section_name, s.average_score, s.scored_count, text(s.note?.text)]);
    }
    for (const s of d.section_averages) {
      values.push(['Section averages', s.name, s.average_score == null ? null : Number(s.average_score), s.scored_count, null]);
    }
  } else {
    sheet.getCell('A3').value = 'No sessions logged yet.';
  }
  for (const c of data.checklist) values.push(['Open checklist items', text(c.text), null, null, text(c.section_name)]);
  if (values.length) {
    table(sheet, [col('Category', 24), longCol('Metric / item'), col('Value / score', 28),
      col('Times scored', 16), longCol('Latest to improve note / section')], values, 5);
    values.forEach((row, i) => {
      if (row[0] === 'Strongest sections' || row[0] === 'Focus areas' || row[0] === 'Section averages' ||
        row[1] === 'Average case score') scoreStyle(sheet.getCell(i + 6, 3), true);
    });
  } else {
    sheet.getColumn(1).width = 30; sheet.getColumn(2).width = 52;
  }
  return sheet;
}

export function buildExportWorkbook(data, today) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'InterviewPrep';
  workbook.created = date(today);
  summary(workbook, data, today);
  const notesBySession = new Map();
  for (const n of data.sectionNotes) {
    if (!notesBySession.has(n.session_id)) notesBySession.set(n.session_id, new Map());
    notesBySession.get(n.session_id).set(n.section_name, n.score);
  }
  table(workbook.addWorksheet('Cases'), [dateCol, col('Case book', 36, { wrap: true }),
    col('Interview style', 22),
    col('Case type', 26), longCol('Prompt'), col('Format', 14), scoreCol('Overall score'),
    ...caseSectionSeeds.map(scoreCol), longCol('What went well'), longCol('What to improve'), col('Starred', 12)],
  data.sessions.filter(s => s.kind === 'case').map(s => [
    date(s.session_date), s.case_book_name == null ? 'No book / live case'
      : `${s.case_book_name}${s.publication_year == null ? '' : ` (${s.publication_year})`}`,
    ({ interviewer_led: 'Interviewer-led', candidate_led: 'Candidate-led', not_sure: 'Not sure' })[s.case_style] ?? null,
    text(s.question_type_name), text(s.prompt), text(s.format), s.overall_score,
    ...caseSectionSeeds.map(name => notesBySession.get(s.id)?.get(name) ?? null),
    text(s.went_well), text(s.to_improve), s.starred ? 'Yes' : 'No',
  ]));
  table(workbook.addWorksheet('Section notes'), [dateCol, longCol('Prompt'), col('Section', 30),
    scoreCol('Score'), longCol('What went well'), longCol('What to improve')],
  data.sectionNotes.map(n => [date(n.session_date), text(n.prompt), text(n.section_name),
    n.score, text(n.went_well), text(n.to_improve)]));
  table(workbook.addWorksheet('Behavioral'), [dateCol, col('Question type', 28), col('Story used', 34, { wrap: true }),
    longCol('Prompt'), col('Format', 14), scoreCol('Overall score'), longCol('What went well'), longCol('What to improve')],
  data.sessions.filter(s => s.kind === 'behavioral').map(s => [date(s.session_date),
    text(s.question_type_name), text(s.story_title), text(s.prompt), text(s.format),
    s.overall_score, text(s.went_well), text(s.to_improve)]));
  table(workbook.addWorksheet('Stories'), [longCol('Title'), col('Competency', 28), ...['Context', 'Situation', 'Task', 'Action', 'Result'].map(longCol),
    col('Times practiced', 18), col('Average score', 18, { score: true, decimals: true })],
  data.stories.map(s => [text(s.title), text(s.competency_name), text(s.context), text(s.situation),
    text(s.task), text(s.action), text(s.result), s.times_practiced, s.average_score]));
  return workbook;
}
