// Small shared formatting helpers used by the chat replies and the web dashboard.

/** Human, timezone-independent relative time: "in 2 hours", "5 mins ago". */
export function relTime(ts, now = Date.now()) {
  const diff = ts - now;
  const past = diff < 0;
  const secs = Math.round(Math.abs(diff) / 1000);
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['min', 60],
  ];
  for (const [name, size] of units) {
    if (secs >= size) {
      const n = Math.round(secs / size);
      return `${past ? '' : 'in '}${n} ${name}${n > 1 ? 's' : ''}${past ? ' ago' : ''}`;
    }
  }
  return past ? 'just now' : 'in under a minute';
}

/** Absolute time in a fixed, readable form. `tz` is an IANA zone (e.g. Asia/Kolkata). */
export function fmtAbsolute(ts, tz) {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      timeZone: tz || undefined,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

/** Collapse whitespace and clip to n chars with an ellipsis. */
export function trunc(s = '', n = 60) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
