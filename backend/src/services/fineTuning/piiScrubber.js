/**
 * PII scrubber — anonymizes training data before JSONL export.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s]+/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const HANDLE_RE = /@([a-zA-Z0-9_]{2,32})/g;

const REPLACEMENTS = [
  [EMAIL_RE, '[EMAIL]'],
  [PHONE_RE, '[PHONE]'],
  [URL_RE, '[URL]'],
  [IPV4_RE, '[IP]'],
  [CREDIT_CARD_RE, '[CARD]'],
  [SSN_RE, '[SSN]'],
  [HANDLE_RE, '@[USER]'],
];

export function scrubPii(text) {
  if (!text || typeof text !== 'string') return text ?? '';

  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  return out.replace(/\s{2,}/g, ' ').trim();
}

export function scrubTrainingRecord(record) {
  if (!record?.messages) return record;

  return {
    ...record,
    messages: record.messages.map((msg) => ({
      ...msg,
      content: scrubPii(msg.content),
    })),
  };
}

export function scrubBatch(records) {
  return records.map(scrubTrainingRecord);
}
