// How an approved Caddie card is applied to each AI tool. Text only; the user
// pastes it. In our Meta AI check (KR, 2026-10-30) a "Remember that …" rule was
// acknowledged but NOT applied in a new chat, and no Memory setting was found.
// The rule DID work as the first message of a dedicated chat: on the next poster
// request Meta AI asked for audience, price, mood and a photo first. So for Meta
// AI the card starts a dedicated, pinned chat.

import type { CaddieCard, Ingredients, Reading } from '../../contracts/index.ts';

export interface ApplyHint { tool: string; text: string; how: string }

export function applyHint(tool: string | null, rule: string): ApplyHint {
  const t = (tool ?? '').toLowerCase();
  const sentence = rule.trim().replace(/\.$/, '');
  if (t.includes('meta')) {
    return {
      tool: 'Meta AI',
      text: `For this chat: ${lowerFirst(sentence)}.`,
      how: 'Start a new Meta AI chat for posters, send this as its first message, then pin that chat (⋯ → Pin) and keep making posters there. Meta AI did not carry rules into other new chats in our test. The Caddie checks whether your AI then asks first.',
    };
  }
  if (t.includes('chatgpt') || t.includes('openai')) {
    return { tool: 'ChatGPT', text: `${sentence}.`, how: 'Settings → Personalization → Custom instructions → "What would you like ChatGPT to know…". Paste and save.' };
  }
  if (t.includes('gemini')) {
    return { tool: 'Gemini', text: `${sentence}.`, how: 'Create or edit a Gem and paste this into its instructions.' };
  }
  if (t.includes('claude')) {
    return { tool: 'Claude', text: `${sentence}.`, how: 'Paste this into your project instructions (or Settings → Profile preferences).' };
  }
  if (t.includes('copilot')) {
    return { tool: 'Copilot', text: `${sentence}.`, how: 'Paste this into Copilot custom instructions, or at the start of a new chat.' };
  }
  if (t.includes('grok')) {
    return { tool: 'Grok', text: `${sentence}.`, how: 'Paste this into Grok customization, or at the start of a new chat.' };
  }
  return { tool: tool ?? 'your AI', text: `${sentence}.`, how: 'Paste this into your AI tool’s custom instructions or memory. If it has none, start new chats with it.' };
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------- observation


const STOP = new Set(['make', 'making', 'made', 'with', 'from', 'that', 'this', 'your', 'their', 'about', 'tasks', 'like', 'kind', 'some', 'more', 'very', 'into', 'task']);

function words(s: string | null | undefined): Set<string> {
  return new Set((s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).map(w => (w.endsWith('s') ? w.slice(0, -1) : w)));
}

function toolKey(t: string | null | undefined): string {
  return (t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Whether a reading shows THIS card working: the card was applied (not merely approved),
 * the screen shows the same AI tool and the same kind of task, and the AI asked first for
 * the details the card names. Anything less is not counted as the card working.
 */
export function cardObserved(card: CaddieCard, reading: Reading | null): { ok: boolean; asked: (keyof Ingredients)[] } {
  const no = { ok: false, asked: [] as (keyof Ingredients)[] };
  if (!reading?.legible || !reading.aiAskedClarifyingQuestion) return no;
  if (card.status !== 'applied' && card.status !== 'observed-working') return no;
  const tool = toolKey(card.targetTool);
  if (!tool || tool === 'yourai' || tool !== toolKey(reading.tool)) return no;
  // The kind of task must be known on both sides and overlap; unknown is not evidence.
  const cardWords = words(card.scope.replace(/^Tasks like:\s*/i, ''));
  const readWords = words(reading.task);
  if (!cardWords.size || !readWords.size || ![...readWords].some(w => cardWords.has(w))) return no;
  // Every detail the card names must have been asked for. A card without known
  // requirements (older or edited into an unrecognized rule) stays unverified.
  const want = card.asks ?? [];
  if (!want.length) return no;
  const asked = reading.aiAskedFor ?? [];
  return want.every(k => asked.includes(k)) ? { ok: true, asked: want } : no;
}

/**
 * Details a rule text asks the AI to request, recognized from plain wording. Used when the
 * person edits a card: unrecognized wording yields [] and the card is never auto-verified.
 */
export function asksFromText(text: string): (keyof Ingredients)[] {
  const t = text.toLowerCase().replace(/’/g, "'");
  if (!/\bask\b|\bcheck\b|\bconfirm\b/.test(t)) return [];
  // Negated or conditional wording ("do not ask me for the price") is not a request to ask:
  // such rules stay unverified rather than being read backwards.
  if (/\b(do not|don't|dont|never|without|no need to|stop|not)\b/.test(t)) return [];
  const found: (keyof Ingredients)[] = [];
  if (/who (it|this|the \w+) is for|\baudience\b|for whom|who (it's|its) for/.test(t)) found.push('audience');
  if (/\bprice\b|\bcost\b|\bbudget\b|\bnumbers?\b/.test(t)) found.push('price');
  if (/\bfeeling\b|\bmood\b|\btone\b|\bvibe\b/.test(t)) found.push('mood');
  if (/\bphoto\b|\bpicture\b|\bown (image|material)\b/.test(t)) found.push('realPhoto');
  // "product photo" asks about a photo, not about what the product is.
  if (/what (it|this) is\b|what exactly|\bproduct\b(?!\s+(photo|picture|image|shot)s?\b)|which (dessert|drink|item)/.test(t)) found.push('productDetail');
  return found;
}
