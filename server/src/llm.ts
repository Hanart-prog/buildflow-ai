import OpenAI, { toFile } from 'openai';
import { HttpError } from './errors';
import { EXTRACT_SYSTEM, type Complete } from './pipeline';

export type Transcribe = (audio: Buffer, mimeType: string) => Promise<string>;
export type Llm = { complete: Complete; transcribe: Transcribe };

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

export function openAiLlm(apiKey: string): Llm {
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';

  return {
    async complete(system, user) {
      const response = await client.chat.completions.create({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      return response.choices[0]?.message.content ?? '';
    },

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
  throw new HttpError(503, 'Add OPENAI_API_KEY to .env, or set DEMO_MODE=true to try the canned demo.');
};

export const missingKeyLlm: Llm = { complete: unavailable, transcribe: unavailable };

const DEMO_SPEECH =
  'I want a recipe sharing app where people can post recipes and search by ingredient. It has to work on phones, and maybe we add meal planning later.';

const DEMO_REQUIREMENTS = {
  requirements: [
    { id: 'req-post-recipes', text: 'Users can post recipes.', type: 'functional' },
    { id: 'req-ingredient-search', text: 'Users can search recipes by ingredient.', type: 'functional' },
    { id: 'req-mobile', text: 'The app must work well on phones.', type: 'non-functional' },
    { id: 'req-meal-planning', text: 'Should meal planning be part of a later release?', type: 'open-question' },
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

// Runs the real pipeline on canned model replies, so the app works without a key.
export const demoLlm: Llm = {
  complete: async (system, user) => {
    const feature = JSON.parse(user).scope === 'feature';
    if (system === EXTRACT_SYSTEM) {
      return JSON.stringify(feature ? DEMO_FEATURE_REQUIREMENTS : DEMO_REQUIREMENTS);
    }
    return JSON.stringify(feature ? DEMO_FEATURE_BOARDS : DEMO_BOARDS);
  },
  transcribe: async () => DEMO_SPEECH,
};
