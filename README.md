# BuildFlow AI

Talk through a software idea and get a plan you can edit: a system-design diagram, a feature hierarchy and a roadmap, all on interactive canvases.

## How it works

1. **Capture.** The browser records your voice and OpenAI transcribes it. You can review or type the text before generating.
2. **Extract.** The first LLM stage pulls structured requirements out of the rambling speech and flags open questions.
3. **Map.** The second stage turns those requirements into three linked boards and maps the dependencies between nodes.
4. **Edit.** Rename, move, connect, add or delete anything. Changes save automatically to PostgreSQL.

Talking again extends the same plan. Generation only ever adds to it: the merge step in `server/src/pipeline.ts` keeps every existing node, edge and position, so your hand edits survive. Model output is schema-validated, retried once with the error fed back, and stripped of edges that point at nodes that don't exist.

## Stack

React, TypeScript, React Flow, Vite, Node.js, Express, PostgreSQL (embedded through PGlite, so there is nothing to install), OpenAI API.

## Run it

Requires Node 20 or newer.

```sh
npm install
cp .env.example .env   # add OPENAI_API_KEY
npm run dev            # http://localhost:5173
```

To try it without a key, set `DEMO_MODE=true` in `.env`. The real pipeline then runs on canned model replies.

```sh
npm test
npm run typecheck
```
