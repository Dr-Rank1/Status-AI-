/** Parse @handle mentions from message content */
export function parseMentions(content) {
  if (!content) return [];
  const matches = content.matchAll(/@([a-zA-Z0-9_]+)/g);
  return [...new Set([...matches].map((m) => m[1].toLowerCase()))];
}
