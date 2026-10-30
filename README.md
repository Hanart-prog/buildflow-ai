# BuildFlow AI

Talk through a software idea and watch the plan draw itself: a system-design diagram, a feature hierarchy and a roadmap, all on interactive canvases. Plan a whole product from scratch, or add one feature to a plan you already have.

## How it works

1. **Capture.** The browser records your voice and Whisper transcribes it. You can review or type the text before generating, and choose **New project** or **Add a feature**.
2. **Extract.** The first LLM stage pulls structured requirements out of the rambling speech and flags open questions.
3. **Map.** The second stage turns those requirements into three linked boards and maps the dependencies between nodes. Requirements stream to the page as soon as they are ready, then each new node and edge is drawn onto the canvas in turn.
4. **Edit.** Rename, move, connect, add or delete anything, with undo and redo. Changes save automatically to PostgreSQL.

Talking again extends the same plan. Generation only ever adds to it: the merge step in `server/src/pipeline.ts` keeps every existing node, edge and position, so your hand edits survive. Model output is schema-validated, retried once with the error fed back, and stripped of edges that point at nodes that don't exist.

## Stack

React, TypeScript, [FlowGram](https://github.com/bytedance/flowgram.ai), Vite, Node.js, Express, PostgreSQL (embedded through PGlite, so there is nothing to install), Groq or OpenAI API.

## Run it

Requires Node 20 or newer.

```sh
npm install
cp .env.example .env   # add GROQ_API_KEY (free) or OPENAI_API_KEY
npm run dev            # http://localhost:5173
```

Get a free Groq key at https://console.groq.com/keys. If both keys are set, Groq is used.

To try it without a key, set `DEMO_MODE=true` in `.env`. The real pipeline then runs on canned model replies.

```sh
npm test
npm run typecheck
```
