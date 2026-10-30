// How an approved Caddie card is applied to each AI tool. Text only; the user
// pastes it. In our Meta AI check (KR, 2026-10-30) a "Remember that …" rule was
// acknowledged but NOT applied in a new chat, and no Memory setting was found.
// So for Meta AI the card is pasted as the first message of a chat.

export interface ApplyHint { tool: string; text: string; how: string }

export function applyHint(tool: string | null, rule: string): ApplyHint {
  const t = (tool ?? '').toLowerCase();
  const sentence = rule.trim().replace(/\.$/, '');
  if (t.includes('meta')) {
    return {
      tool: 'Meta AI',
      text: `For this chat: ${lowerFirst(sentence)}.`,
      how: 'Meta AI did not keep rules across new chats in our test. Send this as the first message of each new chat (or keep one chat for posters that starts with it). The Caddie checks whether your AI then asks first.',
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
