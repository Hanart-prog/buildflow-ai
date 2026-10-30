import OpenAI, { toFile } from 'openai';
import { HttpError } from './errors';
import { DETAILS_SYSTEM, EXTRACT_SYSTEM, PREVIEW_SYSTEM, type Complete } from './pipeline';

export type Transcribe = (audio: Buffer, mimeType: string) => Promise<string>;
// complete returns JSON; design returns free text, so it skips any JSON mode.
export type Llm = { complete: Complete; design: Complete; transcribe: Transcribe };

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

// Three screens of markup, within Groq's free limit of 8000 tokens a minute.
const DESIGN_MAX_TOKENS = 5500;

type Provider = {
  apiKey: string;
  baseURL?: string;
  model: string;
  transcribeModel: string;
  // Sent with every completion, for what a provider supports or needs.
  options: { reasoning_effort?: 'low' };
  jsonOptions: { response_format?: { type: 'json_object' } };
  rateLimitMessage: string;
};

export const openAiProvider = (apiKey: string): Provider => ({
  apiKey,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
  options: {},
  jsonOptions: { response_format: { type: 'json_object' } },
  rateLimitMessage: 'OpenAI rate limit reached. Try again shortly.',
});

// Groq has a free plan and speaks the same API as OpenAI. Its JSON mode rejects
// the whole reply on any slip, so validation stays in the pipeline, and low
// reasoning effort leaves the token budget for the plan itself.
export const groqProvider = (apiKey: string): Provider => ({
  apiKey,
  baseURL: 'https://api.groq.com/openai/v1',
  model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  transcribeModel: process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo',
  options: { reasoning_effort: 'low' },
  jsonOptions: {},
  rateLimitMessage: 'Groq\'s free limit was reached. Wait a minute and try again.',
});

export function providerLlm(provider: Provider): Llm {
  const { apiKey, baseURL, model, transcribeModel, options, jsonOptions, rateLimitMessage } = provider;
  const client = new OpenAI({ apiKey, baseURL, maxRetries: 1 });

  const generate = async (
    system: string,
    user: string,
    onDelta: ((delta: string) => void) | undefined,
    extra: Provider['jsonOptions'] & { max_completion_tokens?: number },
  ) => {
    try {
      const stream = await client.chat.completions.create({
        model,
        stream: true,
        ...options,
        ...extra,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      let reply = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        reply += delta;
        if (delta) onDelta?.(delta);
      }
      return reply;
    } catch (error) {
      if (error instanceof OpenAI.APIError && error.status === 429) {
        throw new HttpError(429, rateLimitMessage);
      }
      throw error;
    }
  };

  return {
    complete: (system, user, onDelta) => generate(system, user, onDelta, jsonOptions),
    design: (system, user, onDelta) =>
      generate(system, user, onDelta, { max_completion_tokens: DESIGN_MAX_TOKENS }),

    async transcribe(audio, mimeType) {
      const baseType = mimeType.split(';')[0];
      const extension = AUDIO_EXTENSIONS[baseType] ?? 'webm';
      const file = await toFile(audio, `speech.${extension}`, { type: baseType });
      const { text } = await client.audio.transcriptions.create({ model: transcribeModel, file });
      return text;
    },
  };
}

const unavailable = async (): Promise<never> => {
  throw new HttpError(503, 'Add GROQ_API_KEY (free) or OPENAI_API_KEY to .env, or set DEMO_MODE=true to try the canned demo.');
};

export const missingKeyLlm: Llm = { complete: unavailable, design: unavailable, transcribe: unavailable };

const DEMO_SPEECH =
  'I want a recipe sharing app where people can post recipes and search by ingredient. It has to work on phones, and maybe we add meal planning later.';

const DEMO_REQUIREMENTS = {
  name: 'Recipe Sharing App',
  requirements: [
    { id: 'req-post-recipes', text: 'Users can post recipes.', type: 'functional' },
    { id: 'req-ingredient-search', text: 'Users can search recipes by ingredient.', type: 'functional' },
    { id: 'req-mobile', text: 'The app must work well on phones.', type: 'non-functional' },
    { id: 'req-meal-planning', text: 'Should meal planning be part of a later release?', type: 'open-question' },
  ],
  questions: [
    { id: 'q-stack', topic: 'Tech stack', text: 'What should the app be built with?', options: ['React and Node', 'Next.js', 'React Native'] },
    { id: 'q-style', topic: 'Design', text: 'What should it feel like?', options: ['Warm and homey', 'Clean and minimal', 'Bold and playful'] },
    { id: 'q-accounts', topic: 'Users', text: 'Do people need an account to browse recipes?', options: ['No, only to post', 'Yes, always'] },
  ],
};

const DEMO_BOARDS = {
  system: {
    nodes: [
      { id: 'web-client', label: 'Mobile Web Client', description: 'Responsive React front end', kind: 'client' },
      { id: 'api', label: 'Recipe API', description: 'Handles accounts and recipes', kind: 'service' },
      { id: 'search', label: 'Search Service', description: 'Ingredient lookup', kind: 'service' },
      { id: 'db', label: 'Recipes Database', description: 'PostgreSQL', kind: 'database' },
      { id: 'images', label: 'Image Storage', description: 'Hosted recipe photos', kind: 'external' },
      { id: 'indexer', label: 'Index Queue', description: 'Reindexes changed recipes', kind: 'queue' },
    ],
    edges: [
      { source: 'web-client', target: 'api', label: 'REST' },
      { source: 'web-client', target: 'search', label: 'queries' },
      { source: 'api', target: 'db', label: 'recipes' },
      { source: 'api', target: 'images', label: 'uploads' },
      { source: 'api', target: 'indexer', label: 'change events' },
      { source: 'indexer', target: 'search', label: 'documents' },
    ],
  },
  features: {
    nodes: [
      { id: 'epic-recipes', label: 'Recipe Publishing', description: '', kind: 'epic' },
      { id: 'epic-discovery', label: 'Discovery', description: '', kind: 'epic' },
      { id: 'feat-editor', label: 'Recipe Editor', description: 'Covers req-post-recipes', kind: 'feature' },
      { id: 'feat-photos', label: 'Photo Upload', description: '', kind: 'feature' },
      { id: 'feat-search', label: 'Ingredient Search', description: 'Covers req-ingredient-search', kind: 'feature' },
      { id: 'task-mobile-layout', label: 'Phone Layouts', description: 'Covers req-mobile', kind: 'task' },
      { id: 'task-autocomplete', label: 'Ingredient Autocomplete', description: '', kind: 'task' },
    ],
    edges: [
      { source: 'epic-recipes', target: 'feat-editor' },
      { source: 'epic-recipes', target: 'feat-photos' },
      { source: 'epic-discovery', target: 'feat-search' },
      { source: 'feat-editor', target: 'task-mobile-layout' },
      { source: 'feat-search', target: 'task-autocomplete' },
    ],
  },
  roadmap: {
    nodes: [
      { id: 'phase-foundation', label: 'Foundation', description: 'Accounts and data model', kind: 'phase' },
      { id: 'phase-launch', label: 'Public Launch', description: '', kind: 'phase' },
      { id: 'ms-posting', label: 'Recipe Posting Live', description: '', kind: 'milestone' },
      { id: 'ms-search', label: 'Search Live', description: '', kind: 'milestone' },
      { id: 'ms-mobile-pass', label: 'Mobile Polish Pass', description: '', kind: 'milestone' },
    ],
    edges: [
      { source: 'phase-foundation', target: 'ms-posting' },
      { source: 'ms-posting', target: 'ms-search' },
      { source: 'ms-search', target: 'ms-mobile-pass' },
      { source: 'ms-mobile-pass', target: 'phase-launch' },
    ],
  },
};

const DEMO_FEATURE_REQUIREMENTS = {
  requirements: [
    { id: 'req-meal-plan', text: 'Users can plan meals for the week from saved recipes.', type: 'functional' },
    { id: 'req-shopping-list', text: 'A shopping list is built from the planned meals.', type: 'functional' },
    { id: 'req-plan-sharing', text: 'Should households be able to share a meal plan?', type: 'open-question' },
  ],
  questions: [
    { id: 'q-week-start', topic: 'Design', text: 'Should the planner show a week or a month?', options: ['One week', 'One month'] },
    { id: 'q-diet', topic: 'Data', text: 'Should plans respect dietary needs?', options: ['Yes', 'Not yet'] },
  ],
};

const DEMO_FEATURE_BOARDS = {
  system: {
    nodes: [
      { id: 'planner-service', label: 'Meal Planner Service', description: 'Weekly plans and shopping lists', kind: 'service' },
      { id: 'plans-db', label: 'Plans Database', description: 'Meals per day, per user', kind: 'database' },
      { id: 'reminders', label: 'Reminder Queue', description: 'Sends the weekly shopping list', kind: 'queue' },
    ],
    edges: [
      { source: 'web-client', target: 'planner-service', label: 'plans' },
      { source: 'planner-service', target: 'api', label: 'recipe lookups' },
      { source: 'planner-service', target: 'plans-db', label: 'meal plans' },
      { source: 'planner-service', target: 'reminders', label: 'weekly digest' },
    ],
  },
  features: {
    nodes: [
      { id: 'epic-planning', label: 'Meal Planning', description: '', kind: 'epic' },
      { id: 'feat-calendar', label: 'Weekly Calendar', description: 'Covers req-meal-plan', kind: 'feature' },
      { id: 'feat-shopping', label: 'Shopping List', description: 'Covers req-shopping-list', kind: 'feature' },
      { id: 'task-drag-recipes', label: 'Drag Recipes Onto Days', description: '', kind: 'task' },
    ],
    edges: [
      { source: 'epic-planning', target: 'feat-calendar' },
      { source: 'epic-planning', target: 'feat-shopping' },
      { source: 'feat-calendar', target: 'task-drag-recipes' },
    ],
  },
  roadmap: {
    nodes: [
      { id: 'ms-calendar', label: 'Calendar Beta', description: '', kind: 'milestone' },
      { id: 'ms-shopping', label: 'Shopping Lists Live', description: '', kind: 'milestone' },
    ],
    edges: [
      { source: 'ms-search', target: 'ms-calendar' },
      { source: 'ms-calendar', target: 'ms-shopping' },
    ],
  },
};

const DEMO_DETAILS = {
  summary: 'This part of the plan carries one clear responsibility in the recipe app. It exists so that each requirement has an obvious owner.',
  sections: [
    { title: 'Responsibilities', items: ['Own its data and rules', 'Expose a small, stable interface'] },
    { title: 'Tech stack', items: ['TypeScript on Node 20', 'PostgreSQL for storage'] },
    { title: 'Risks', items: ['Ingredient search quality on large catalogues'] },
  ],
};

const DEMO_PALETTE = '<style>:root{--brand:#c8452b;--accent:#f2a33c;--bg:#fff8ef;--ink:#2b1a10;--muted:#8d6a52}</style>';

const demoScreen = (title: string, body: string) =>
  `${DEMO_PALETTE}<div class="hero"><h1>${title}</h1></div><div class="body">${body}</div>`;

const DEMO_PREVIEW = `<!-- screen: Discover | mobile -->
${demoScreen('🍅 What can I cook?', '<div class="card row"><div class="photo">🍅</div><div class="grow"><h3>Smoky tomato orzo</h3><p class="muted">Tomato, orzo, paprika · 25 min</p></div></div><div class="card row"><div class="photo">🍋</div><div class="grow"><h3>Lemon herb chicken</h3><p class="muted">Chicken, lemon, thyme · 40 min</p></div></div>')}
<!-- screen: Recipe | mobile -->
${demoScreen('Smoky tomato orzo', '<div class="photo wide">🍝</div><div class="card">Toast the orzo in butter until golden, then add the tomatoes.</div><p class="muted">Saved by 214 home cooks</p>')}`;

const DEMO_LINKS = [
  { feature: 'feat-editor', system: ['web-client', 'api', 'db'], roadmap: ['ms-posting'] },
  { feature: 'feat-photos', system: ['api', 'images'], roadmap: ['ms-posting'] },
  { feature: 'feat-search', system: ['search', 'indexer'], roadmap: ['ms-search'] },
];

// Runs the real pipeline on canned model replies, so the app works without a key.
export const demoLlm: Llm = {
  complete: async (system, user, onDelta) => {
    if (system === DETAILS_SYSTEM) return JSON.stringify(DEMO_DETAILS);
    const feature = JSON.parse(user).scope === 'feature';
    if (system === EXTRACT_SYSTEM) {
      return JSON.stringify(feature ? DEMO_FEATURE_REQUIREMENTS : DEMO_REQUIREMENTS);
    }
    const reply = JSON.stringify(feature ? DEMO_FEATURE_BOARDS : { ...DEMO_BOARDS, links: DEMO_LINKS });
    onDelta?.(reply);
    return reply;
  },
  design: async (system, _user, onDelta) => {
    if (system === PREVIEW_SYSTEM) onDelta?.(DEMO_PREVIEW);
    return DEMO_PREVIEW;
  },
  transcribe: async () => DEMO_SPEECH,
};
