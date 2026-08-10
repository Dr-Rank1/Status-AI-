const POSITIVE = [
  'love', 'thanks', 'thank', 'great', 'awesome', 'amazing', 'help', 'kind',
  'beautiful', 'wonderful', 'friend', 'respect', 'admire', 'brilliant', 'cool',
  'nice', 'please', 'sorry', 'appreciate', 'best', 'hero', 'legend',
];

const NEGATIVE = [
  'hate', 'stupid', 'idiot', 'worst', 'ugly', 'dumb', 'trash', 'loser',
  'pathetic', 'annoying', 'shut up', 'kill', 'die', 'suck', 'boring',
];

export function analyzeSentiment(text) {
  const lower = text.toLowerCase();
  let score = 0;

  for (const word of POSITIVE) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of NEGATIVE) {
    if (lower.includes(word)) score -= 1;
  }

  if (text.includes('?')) score += 0.2;
  if (text.length > 120) score += 0.3;

  score = Math.max(-1, Math.min(1, score / 3));

  let label = 'neutral';
  if (score >= 0.25) label = 'positive';
  else if (score <= -0.25) label = 'negative';

  const affinityDelta = Math.round(score * 6);
  const reputationDelta =
    label === 'positive' ? 2 : label === 'negative' ? -3 : 0;

  return { score, label, affinityDelta, reputationDelta };
}
