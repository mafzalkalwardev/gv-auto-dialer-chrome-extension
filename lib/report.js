/* ------------------------------------------------------------------
 * report.js — reads the uploaded lead file, writes the call report.
 * Depends on SheetJS being loaded first (window.XLSX).
 * ------------------------------------------------------------------ */

/** Parse an uploaded CSV / XLSX / XLS File into an array of row objects. */
export async function parseLeadFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('That file has no readable sheet.');
  // defval:'' keeps blank cells as empty strings so column keys stay stable.
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

const COLUMNS = [
  'Sr.No.',
  'Phone Number',
  'Customer Name',
  'Call Status',
  'Call Result',
  'Call Duration',
  'Call Start Time',
  'Call End Time',
];

/** Local, 24-hour, dd/mm/yyyy — matches the reference report format. */
function stamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}, ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function titleCase(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

export function buildReportRows(contacts) {
  return contacts
    .filter((c) => c.status === 'completed' || c.status === 'failed')
    .map((c, i) => ({
      'Sr.No.': i + 1,
      'Phone Number': c.number,
      'Customer Name': c.name,
      'Call Status': titleCase(c.status),
      'Call Result': c.result || '',
      'Call Duration': c.durationSeconds === null ? '' : `${c.durationSeconds}s`,
      'Call Start Time': stamp(c.startedAt),
      'Call End Time': stamp(c.endedAt),
    }));
}

/** Build the workbook and trigger a download. */
export function downloadReport(contacts, filename) {
  const rows = buildReportRows(contacts);
  if (!rows.length) throw new Error('No completed calls to export yet.');

  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  ws['!cols'] = [
    { wch: 7 }, { wch: 15 }, { wch: 22 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 22 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Call Report');

  const name = filename || `call-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
  return rows.length;
}
