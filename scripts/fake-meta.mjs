// LOCAL TEST ONLY. A scripted stand-in for the Meta Model API and the media
// service so the full pipeline can be exercised without paid calls. Everything
// it returns is labeled `fixture` by the Worker and never counts as evidence.
//
// Usage: node scripts/fake-meta.mjs            (listens on 127.0.0.1:8799)
// Worker: npx wrangler dev --local --port 8788 --var COEVO_TEST_FAKE_META:true \
//   --var META_API_BASE_URL:http://127.0.0.1:8799/v1 --var COEVO_ALLOW_LIVE_CALLS:true \
//   --var MODAL_MEDIA_URL:http://127.0.0.1:8799/media --var MODAL_MEDIA_TOKEN:fake

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';

const PORT = Number(process.env.FAKE_META_PORT ?? 8799);
let readingIndex = 0;
const jobs = new Map();
/** One-shot failure injection: task names (e.g. "short") or "media-podcast" / "media-short". */
const failNext = new Set();

const none = { audience: false, price: false, mood: false, realPhoto: false, productDetail: false };
const READINGS = [
  { userRequest: 'Make a poster for our new dessert', vagueTerms: [], ingredients: none, aiAskedClarifyingQuestion: false },
  { userRequest: 'Make it more premium', vagueTerms: ['premium'], ingredients: none, aiAskedClarifyingQuestion: false },
  { userRequest: 'More premium please', vagueTerms: ['premium'], ingredients: none, aiAskedClarifyingQuestion: false },
  { userRequest: 'Even more premium. Luxurious.', vagueTerms: ['premium', 'luxurious'], ingredients: none, aiAskedClarifyingQuestion: false },
  { userRequest: 'It’s for office workers near Seongsu station on their morning walk. Matcha basque cheesecake, 6,500 won. Warm morning light, calm, a little handwritten. Use my real photo.', vagueTerms: [], ingredients: { audience: true, price: true, mood: true, realPhoto: true, productDetail: true }, aiAskedClarifyingQuestion: false },
  { userRequest: 'Make a poster for our new drink', vagueTerms: [], ingredients: none, aiAskedClarifyingQuestion: true },
];

function reading() {
  const r = READINGS[readingIndex % READINGS.length];
  readingIndex++;
  return { legible: true, tool: 'AI Assistant', task: r.aiAskedClarifyingQuestion ? 'poster for a new drink' : 'poster for a new dessert', userTyping: false, aiResponseSummary: r.aiAskedClarifyingQuestion ? 'Asked who it is for, the price, the feeling and for a photo before making it.' : 'Generated a poster.', artifactVisible: !r.aiAskedClarifyingQuestion, confidence: 0.9, ...r };
}

function decision(input) {
  const quiet = (note, reason) => ({ action: 'stay-quiet', step: 'watch', reason, quote: null, message: null, note, missingIngredients: [], exampleBrief: null });
  if (input.activeCards.length && input.reading.aiAskedClarifyingQuestion) return quiet('[test] Your AI asked first. Staying quiet.', 'The AI asked the clarifying questions.');
  if (input.firstSighting) return quiet('[test] I can see an AI chat making a poster. I will speak only when it helps.', 'First look at the screen.');
  const last = input.interventions.at(-1);
  if (last?.response?.startsWith('asked-example')) {
    return { action: 'intervene', step: 'example', reason: 'The person asked for an example.', quote: null, message: '[test] Here is an example. Change it to your own words.', note: null, missingIngredients: [], exampleBrief: 'A poster for office workers near the station: matcha cheesecake, 6,500 won, warm morning light, my real photo.' };
  }
  if (last?.response?.startsWith('voice-answer')) {
    return { action: 'intervene', step: 'question', reason: 'They answered with who it is for and the price.', quote: null, message: '[test] That is your brief. Type it in your own words.', note: null, missingIngredients: [], exampleBrief: null };
  }
  const rep = input.repeatedVagueTerm;
  if (rep && rep.count >= 3 && !input.interventions.length) {
    return { action: 'intervene', step: 'question', reason: `The same vague word was used ${rep.count} times without new ingredients.`, quote: 'more premium', message: `[test] You’ve asked for “more ${rep.term}” ${rep.count}×. Who is this dessert for?`, note: null, missingIngredients: ['audience', 'price'], exampleBrief: null };
  }
  return quiet('[test] On track.', 'Nothing needs a nudge yet.');
}

const words = n => Array.from({ length: n }, (_, i) => ['brief', 'morning', 'price', 'photo', 'guest', 'cafe', 'poster', 'calm'][i % 8]).join(' ');

const OUT = {
  learning_design: () => ({ habit: '[test] Naming who it is for and the price instead of repeating "premium".', turningPoint: { quote: 'more premium', momentId: null }, remainingConditions: ['[test] Check the price is readable.'], counterpoint: '[test] Sometimes vague words are fine for quick drafts.', ingredientsUsed: ['audience', 'price', 'mood', 'realPhoto'], formats: Object.fromEntries(['note', 'manual', 'flashcards', 'podcast', 'short'].map(f => [f, { make: true, why: `[test] Why ${f} now.` }])) }),
  note: () => ({ title: '[test] What changed the poster', body: '[test] Four requests for "more premium" kept the same poster. Naming office workers, 6,500 won and a calm morning changed it.', quotes: [{ text: 'more premium', momentId: null }], remaining: ['[test] Is the price visible on a phone screen?'] }),
  manual: () => ({ title: '[test] Poster brief recipe', whenToUse: '[test] Any new menu poster.', whenNotToUse: '[test] Quick internal drafts.', steps: [{ text: '[test] Say who it is for.', check: 'audience', owner: 'you' }, { text: '[test] Ask me for the price before drafting.', check: 'price', owner: 'ai' }], pitfalls: ['[test] Repeating "premium".'], forYourAI: ['[test] Ask who it is for and the price first.'], youDecide: ['[test] The one feeling.'], cardRule: 'Before making a poster, ask me who it is for, the price, one feeling, and whether I have a real photo' }),
  flashcards: () => ({ cards: [{ scenario: '[test] A customer wants a cuter cookie poster for kids, 3,000 won.', prompt: '[test] What do you tell the AI first?', answer: '[test] Who it is for and the price; "cute" alone is vague.' }] }),
  podcast: () => ({ title: '[test] Why "premium" fails', guest: 'Jun, bakery owner', lines: Array.from({ length: 10 }, (_, i) => ({ speaker: i % 2 ? 'guest' : 'caddie', text: `[test] ${words(30)}.` })) }),
  podcast_ask: () => ({ answer: '[test] Because the AI cannot guess your customers.' }),
  short: () => ({ title: '[test] Four ingredients', scenes: [
    { role: 'hook', narration: `[test] ${words(18)}.`, imagePrompt: 'a calm cafe counter at morning', evidence: null, diagram: null },
    { role: 'evidence', narration: `[test] ${words(18)}.`, imagePrompt: null, evidence: 'before', diagram: null },
    { role: 'cause', narration: `[test] ${words(20)}.`, imagePrompt: null, evidence: null, diagram: { nodes: ['More premium', 'AI guesses', 'Same poster'] } },
    { role: 'rule', narration: `[test] ${words(18)}.`, imagePrompt: 'a hand writing a menu card', evidence: null, diagram: null },
    { role: 'question', narration: `[test] ${words(16)}?`, imagePrompt: 'a quiet street in the morning', evidence: null, diagram: null },
  ] }),
  practice_scenario: () => ({ scenario: '[test] A regular asks for a Halloween pumpkin latte poster.', hint: '[test] Who, price, one feeling, a real photo.' }),
  practice_check: () => ({ ingredients: { audience: true, price: true, mood: false, realPhoto: false, productDetail: true }, note: '[test] Add one concrete feeling next time.' }),
};

function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const message = obj => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }], usage: { input_tokens: 1500, output_tokens: 200, input_tokens_details: { cached_tokens: 0 }, images_processed: 1 } });

function render(job) {
  return new Promise((resolve, reject) => {
    const p = spawn('python3', ['infra/modal/fake_render.py'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.on('close', code => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`render exited ${code}`))));
    p.stdin.end(JSON.stringify(job));
  });
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const url = req.url ?? '';
  try {
    if (req.method === 'POST' && url === '/v1/responses/input_tokens') {
      const body = JSON.parse(raw.toString());
      if (failNext.delete(`count-${body.text?.format?.name}`)) return send(res, 400, { error: { message: 'fake: injected count failure', type: 'invalid_request_error', code: null } });
      return send(res, 200, { object: 'response.input_tokens', input_tokens: 1200 + Math.round(raw.length / 4) });
    }
    if (req.method === 'POST' && url === '/v1/responses') {
      const body = JSON.parse(raw.toString());
      if (body.model === 'sam-3.1') return send(res, 200, message('<0f>0<|box;x1=128;y1=72;x2=1151;y2=647;w=1280;h=720;c=0.93|><|mask;x=0;y=0;data=2,2,!AA|>'));
      const name = body.text?.format?.name;
      if (failNext.delete(name)) return send(res, 500, { error: { message: `fake: injected failure for ${name}`, type: 'server_error', code: null } });
      if (name === 'screen_reading') return send(res, 200, message(reading()));
      if (name === 'caddie_decision') {
        const text = body.input[0].content[0].text;
        return send(res, 200, message(decision(JSON.parse(text.slice(text.indexOf('{'))))));
      }
      if (OUT[name]) return send(res, 200, message(OUT[name]()));
      return send(res, 400, { error: { message: `fake: unknown task ${name}`, type: 'invalid_request_error', code: null } });
    }
    if (req.method === 'POST' && url === '/v1/images/generations') return send(res, 200, { data: [{ b64_json: png(64, 96, [120, 150, 110]).toString('base64') }] });
    if (req.method === 'POST' && url.startsWith('/v1/asr/transcribe')) return send(res, 200, { transcript: '[test] Office workers near the station, six thousand five hundred won, a calm morning feel.', audioDurationMs: 4000, turns: [] });
    if (req.method === 'POST' && url === '/media/jobs') {
      const id = `job_${jobs.size + 1}`;
      const job = JSON.parse(raw.toString());
      jobs.set(id, failNext.delete(`media-${job.kind}`) ? Promise.resolve({ status: 'failed', error: 'fake: injected render failure' }) : render(job).catch(e => ({ status: 'failed', error: String(e) })));
      return send(res, 200, { job_id: id });
    }
    const m = url.match(/^\/media\/jobs\/(job_\d+)$/);
    if (req.method === 'GET' && m) {
      const p = jobs.get(m[1]);
      if (!p) return send(res, 404, { status: 'failed', error: 'unknown job' });
      const done = await Promise.race([p, new Promise(r => setTimeout(() => r(null), 50))]);
      return done ? send(res, done.status === 'failed' ? 500 : 200, done) : send(res, 202, { status: 'running' });
    }
    if (url === '/reset') { readingIndex = 0; failNext.clear(); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url === '/fail') { failNext.add(JSON.parse(raw.toString()).name); return send(res, 200, { ok: true, failNext: [...failNext] }); }
    send(res, 404, { error: { message: 'not found' } });
  } catch (e) {
    send(res, 500, { error: { message: String(e), type: 'server_error', code: null } });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`fake meta + media on http://127.0.0.1:${PORT} (TEST ONLY)`));
