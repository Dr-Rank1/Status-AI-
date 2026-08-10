/**
 * Generates distinct synthetic user personas for staging simulation.
 */

const FIRST_NAMES = [
  'Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper',
  'Indigo', 'Jordan', 'Kai', 'Logan', 'Morgan', 'Nova', 'Oakley', 'Parker',
  'Quinn', 'River', 'Sage', 'Taylor', 'Uma', 'Vale', 'Winter', 'Xen', 'Yuri', 'Zara',
];

const TRAIT_AXES = [
  'curiosity', 'empathy', 'sarcasm', 'formality', 'enthusiasm', 'conflict_avoidance',
];

const FANDOMS = ['sci-fi', 'fantasy', 'slice-of-life', 'mystery', 'romance', 'horror'];
const TONES = ['warm', 'neutral', 'playful', 'intense', 'reserved'];
const GOALS = ['deep_lore', 'casual_chat', 'roleplay', 'debate', 'emotional_support'];

export function createPersona(index) {
  const seed = index + 1;
  const name = FIRST_NAMES[index % FIRST_NAMES.length];
  const suffix = Math.floor(seed / FIRST_NAMES.length);
  const displayName = suffix > 0 ? `${name}${suffix}` : name;
  const personaKey = `sim-persona-${String(seed).padStart(5, '0')}`;

  const traits = {
    ageBand: pick(['18-24', '25-34', '35-44'], seed),
    fandomPreference: pick(FANDOMS, seed * 3),
    conversationalTone: pick(TONES, seed * 7),
    interactionGoal: pick(GOALS, seed * 11),
    messageLength: pick(['short', 'medium', 'long'], seed * 13),
    axes: Object.fromEntries(
      TRAIT_AXES.map((axis, i) => [axis, round01(pseudoRandom(seed * (i + 2)))]),
    ),
  };

  return { personaKey, displayName, traits };
}

export function generatePersonaBatch(count) {
  const n = Math.min(Math.max(count, 1), 5000);
  return Array.from({ length: n }, (_, i) => createPersona(i));
}

export function buildSimulatedUserMessage(persona, character, turnIndex) {
  const { traits } = persona;
  const templates = messageTemplates(traits, character);
  const template = templates[turnIndex % templates.length];
  return template
    .replace('{character}', character.name ?? 'there')
    .replace('{fandom}', character.fandom ?? traits.fandomPreference);
}

function messageTemplates(traits, character) {
  const base = [
    `Hey ${character.name}, I've been thinking about ${traits.fandomPreference} lore lately.`,
    `What would you do if we were stuck in a ${traits.fandomPreference} storyline together?`,
    `I'm feeling ${traits.conversationalTone} today — got time to chat?`,
    `Tell me something only ${character.name} would know about ${character.fandom ?? 'your world'}.`,
    `Quick question: how do you handle conflict in your story?`,
  ];

  if (traits.interactionGoal === 'debate') {
    base.push(`I disagree with how ${character.name} handled the last arc. Convince me.`);
  }
  if (traits.interactionGoal === 'emotional_support') {
    base.push(`I'm having a rough day. Can you just listen for a minute?`);
  }
  if (traits.messageLength === 'long') {
    base.push(
      `So here's the full context: I've been replaying the ${traits.fandomPreference} timeline `
      + `and I keep wondering where ${character.name} fits in the bigger picture...`,
    );
  }

  return base;
}

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function round01(n) {
  return Math.round(n * 100) / 100;
}
