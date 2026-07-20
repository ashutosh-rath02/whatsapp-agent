// Title-based relevance + fit tagging for job postings. Cheap, in-process,
// no LLM call — runs against every posting from every company on every poll,
// so it has to be fast. Deliberately scoped to the roles actually asked for:
// software/full-stack/backend/frontend engineer, AI/ML engineer, forward
// deployed engineer — not every title containing the word "engineer".
const ROLE_RE =
  /\b(software\s+(?:development\s+)?engineer|software\s+developer|sde|full[\s-]?stack\s+(?:engineer|developer)|back[\s-]?end\s+(?:engineer|developer)|front[\s-]?end\s+(?:engineer|developer)|ai\s+engineer|applied\s+ai\s+engineer|ml\s+engineer|machine\s+learning\s+engineer|forward\s+deployed\s+engineer)\b/i;

// Titles that contain a role keyword but aren't the IC role itself.
const EXCLUDE_RE =
  /\b(engineering\s+manager|manager,?\s+engineering|director|vp|vice\s+president|head\s+of|chief\s+\w+\s+officer|sales\s+engineer|support\s+engineer|field\s+engineer|solutions?\s+engineer|test\s+engineer|qa\s+engineer|hardware\s+engineer|network\s+engineer|security\s+engineer|devops\s+engineer|site\s+reliability|data\s+engineer|infrastructure\s+engineer)\b/i;

const SENIOR_RE = /\b(senior|sr\.?|staff|principal|lead|director|vp|vice\s+president|head\s+of|distinguished)\b/i;
const JUNIOR_RE = /\b(junior|jr\.?|associate|entry[\s-]?level|new\s+grad|graduate|intern|trainee)\b/i;

export function isRelevant(title = '') {
  return ROLE_RE.test(title) && !EXCLUDE_RE.test(title);
}

/** @returns {'Good fit'|'Stretch'} — never gates delivery, only labels it. */
export function fitFor(title = '') {
  if (JUNIOR_RE.test(title)) return 'Good fit';
  if (SENIOR_RE.test(title)) return 'Stretch';
  return 'Good fit';
}
