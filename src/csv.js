// Minimal RFC4180 CSV parser — dependency-free, like the rest of this
// project. Handles quoted fields with embedded commas/newlines/escaped
// quotes ("") since data/*.csv (Key Investors, notes) has all three.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\r') continue;
    else if (c === '\n') pushRow();
    else field += c;
  }
  if (field !== '' || row.length) pushRow();
  if (!rows.length) return [];

  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1 || r[0] !== '').map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    return obj;
  });
}
