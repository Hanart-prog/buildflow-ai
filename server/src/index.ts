import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createApp } from './app';
import { openStore } from './db';
import { demoLlm, groqProvider, missingKeyLlm, openAiProvider, providerLlm } from './llm';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, '../../.env'), quiet: true });

const llm =
  process.env.DEMO_MODE === 'true'
    ? demoLlm
    : process.env.GROQ_API_KEY
      ? providerLlm(groqProvider(process.env.GROQ_API_KEY))
      : process.env.OPENAI_API_KEY
        ? providerLlm(openAiProvider(process.env.OPENAI_API_KEY))
        : missingKeyLlm;

const store = await openStore(path.join(here, '../data/pg'));
const port = Number(process.env.PORT) || 3001;

createApp(store, llm, { password: process.env.APP_PASSWORD }).listen(port, () => {
  console.log(`BuildFlow API on http://localhost:${port}`);
});
