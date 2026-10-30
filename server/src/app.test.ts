import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyPlan, parseScreens, type GenerateEvent, type PreviewEvent, type Project } from '../../shared/plan';
import { createApp } from './app';
import { openStore, type Store } from './db';
import { demoLlm, missingKeyLlm } from './llm';

let store: Store;
let server: Server;
let keylessServer: Server;
let base: string;
let keylessBase: string;

const urlOf = (s: Server) => {
  const address = s.address();
  if (!address || typeof address === 'string') throw new Error('Server is not listening');
  return `http://127.0.0.1:${address.port}/api`;
};

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const newProject = async (): Promise<Project> =>
  (await send(`${base}/projects`, 'POST', { name: 'Test' })).json();

const generate = async (url: string, body: unknown): Promise<GenerateEvent[]> => {
  const res = await send(url, 'POST', body);
  return (await res.text()).trim().split('\n').map((line) => JSON.parse(line));
};

const finished = (events: GenerateEvent[]): Project => {
  const last = events.at(-1);
  if (last?.type !== 'done') throw new Error(`Stream did not finish: ${JSON.stringify(last)}`);
  return last.project;
};

beforeAll(async () => {
  store = await openStore();
  server = createApp(store, demoLlm).listen(0);
  keylessServer = createApp(store, missingKeyLlm).listen(0);
  base = urlOf(server);
  keylessBase = urlOf(keylessServer);
});

afterAll(async () => {
  server.close();
  keylessServer.close();
  await store.close();
});

describe('projects API', () => {
  it('creates, lists, updates and deletes a project', async () => {
    const project = await newProject();

    const plan = emptyPlan();
    plan.boards.system.nodes.push({ id: 'n', label: 'Node', description: '', kind: 'service', x: 1, y: 2 });
    const saved = await send(`${base}/projects/${project.id}`, 'PUT', { name: 'Renamed', plan });
    expect(await saved.json()).toMatchObject({ name: 'Renamed', plan });

    const listed: { id: string }[] = await (await fetch(`${base}/projects`)).json();
    expect(listed.map((p) => p.id)).toContain(project.id);

    expect((await send(`${base}/projects/${project.id}`, 'DELETE')).status).toBe(204);
    expect((await fetch(`${base}/projects/${project.id}`)).status).toBe(404);
  });

  it('rejects a malformed plan', async () => {
    const project = await newProject();
    const res = await send(`${base}/projects/${project.id}`, 'PUT', { plan: { boards: {} } });
    expect(res.status).toBe(400);
  });

  it('generates a plan and accumulates the transcript', async () => {
    const project = await newProject();
    const url = `${base}/projects/${project.id}/generate`;

    const first = finished(await generate(url, { text: 'first idea' }));
    expect(first.plan.requirements.length).toBeGreaterThan(0);
    expect(first.plan.boards.system.edges.length).toBeGreaterThan(0);

    const second = finished(await generate(url, { text: 'second idea' }));
    expect(second.transcript).toBe('first idea\n\nsecond idea');
    expect(second.plan.boards.system.nodes).toHaveLength(first.plan.boards.system.nodes.length);
  });

  it('streams requirements before the finished plan', async () => {
    const project = await newProject();
    const events = await generate(`${base}/projects/${project.id}/generate`, { text: 'idea' });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('requirements');
    expect(types).toContain('node');
    expect(types).toContain('edge');
    expect(types.at(-1)).toBe('done');
    expect(types.indexOf('node')).toBeLessThan(types.indexOf('edge'));
  });

  it('extends an existing plan with a feature and links it in', async () => {
    const project = await newProject();
    const url = `${base}/projects/${project.id}/generate`;
    const before = finished(await generate(url, { text: 'the product' }));
    const after = finished(await generate(url, { text: 'meal planning', scope: 'feature' }));

    expect(after.plan.boards.system.nodes.length).toBeGreaterThan(before.plan.boards.system.nodes.length);
    expect(after.plan.boards.system.edges.map((e) => e.id)).toContain('planner-service->api');
  });

  it('asks questions, and treats answers as decisions on the next build', async () => {
    const project = await newProject();
    const url = `${base}/projects/${project.id}/generate`;
    const first = finished(await generate(url, { text: 'idea' }));
    expect(first.plan.questions.length).toBeGreaterThan(0);

    const answered = first.plan.questions.map((q, i) => (i === 0 ? { ...q, answer: 'Next.js' } : q));
    await send(`${base}/projects/${project.id}`, 'PUT', { plan: { ...first.plan, questions: answered } });
    const second = finished(await generate(url, { text: 'more' }));

    expect(second.plan.questions[0]).toMatchObject({ answer: 'Next.js', used: true });
    expect(second.plan.questions.filter((q) => q.used)).toHaveLength(1);
  });

  it('accepts files from an existing product', async () => {
    const project = await newProject();
    const events = await generate(`${base}/projects/${project.id}/generate`, { text: 'Map it', source: 'README' });
    expect(finished(events).plan.requirements.length).toBeGreaterThan(0);
  });

  it('writes details for a node, and 404s for an unknown one', async () => {
    const project = await newProject();
    finished(await generate(`${base}/projects/${project.id}/generate`, { text: 'idea' }));
    const url = `${base}/projects/${project.id}/details`;

    const details = await (await send(url, 'POST', { board: 'system', nodeId: 'api' })).json();
    expect(details.sections.length).toBeGreaterThan(0);
    expect((await send(url, 'POST', { board: 'system', nodeId: 'nope' })).status).toBe(404);
  });

  it('attaches a build to the chosen node on the chosen board', async () => {
    const project = await newProject();
    const url = `${base}/projects/${project.id}/generate`;
    finished(await generate(url, { text: 'the product' }));

    const focus = { board: 'features', nodeId: 'epic-discovery' };
    const after = finished(await generate(url, { text: 'meal planning', scope: 'feature', focus }));

    expect(after.plan.boards.features.edges.map((e) => e.id)).toContain('epic-discovery->epic-planning');
  });

  it('rejects a focus on a node that is gone', async () => {
    const project = await newProject();
    const focus = { board: 'system', nodeId: 'gone' };
    const res = await send(`${base}/projects/${project.id}/generate`, 'POST', { text: 'x', focus });
    expect(res.status).toBe(404);
  });

  it('shares a read-only copy without the transcript, and can stop', async () => {
    const project = await newProject();
    finished(await generate(`${base}/projects/${project.id}/generate`, { text: 'private words' }));

    const { shareId } = await (await send(`${base}/projects/${project.id}/share`, 'POST')).json();
    const again = await (await send(`${base}/projects/${project.id}/share`, 'POST')).json();
    expect(again.shareId).toBe(shareId);

    const shared = await (await fetch(`${base}/shared/${shareId}`)).json();
    expect(shared.plan.requirements.length).toBeGreaterThan(0);
    expect(JSON.stringify(shared)).not.toContain('private words');

    expect((await send(`${base}/projects/${project.id}/share`, 'DELETE')).status).toBe(204);
    expect((await fetch(`${base}/shared/${shareId}`)).status).toBe(404);
  });

  it('needs the password for everything except shared links', async () => {
    const locked = createApp(store, demoLlm, { password: 'open sesame' }).listen(0);
    const url = urlOf(locked);
    const project = await newProject();
    const { shareId } = await (await send(`${base}/projects/${project.id}/share`, 'POST')).json();
    const auth = (secret: string) => ({
      headers: { authorization: `Basic ${Buffer.from(`x:${secret}`).toString('base64')}` },
    });

    const statuses = [
      (await fetch(`${url}/projects`)).status,
      (await fetch(`${url}/projects`, auth('wrong'))).status,
      (await fetch(`${url}/projects`, auth('open sesame'))).status,
      (await fetch(`${url}/shared/${shareId}`)).status,
    ];
    locked.close();
    expect(statuses).toEqual([401, 401, 200, 200]);
  });

  it('rejects an unknown scope', async () => {
    const project = await newProject();
    const res = await send(`${base}/projects/${project.id}/generate`, 'POST', { text: 'x', scope: 'nope' });
    expect(res.status).toBe(400);
  });

  it('reports a failure after streaming has started, and keeps the plan unchanged', async () => {
    let calls = 0;
    const flaky = createApp(store, {
      ...demoLlm,
      complete: async (system, user) => {
        calls += 1;
        if (calls > 1) throw new Error('model down');
        return demoLlm.complete(system, user);
      },
    }).listen(0);
    const project = await newProject();

    const events = await generate(`${urlOf(flaky)}/projects/${project.id}/generate`, { text: 'idea' });
    flaky.close();

    expect(events.map((e) => e.type)).toEqual(['requirements', 'error']);
    expect(events.at(-1)).toMatchObject({ error: 'model down' });
    const stored: Project = await (await fetch(`${base}/projects/${project.id}`)).json();
    expect(stored.plan).toEqual(emptyPlan());
  });

  it('streams mockup screens and saves them with the plan', async () => {
    const project = await newProject();
    const res = await send(`${base}/projects/${project.id}/preview`, 'POST');
    const events: PreviewEvent[] = (await res.text()).trim().split('\n').map((line) => JSON.parse(line));

    expect(events[0].type).toBe('delta');
    const last = events.at(-1);
    if (last?.type !== 'done') throw new Error('Preview did not finish');
    expect(parseScreens(last.project.plan.preview).map((s) => s.name)).toEqual(['Discover', 'Recipe']);
  });

  it('keeps the preview when the plan is extended', async () => {
    const project = await newProject();
    await send(`${base}/projects/${project.id}/preview`, 'POST');
    const after = finished(await generate(`${base}/projects/${project.id}/generate`, { text: 'idea' }));
    expect(after.plan.preview).toContain('Discover');
  });

  it('transcribes uploaded audio', async () => {
    const project = await newProject();
    const form = new FormData();
    form.append('audio', new Blob(['fake'], { type: 'audio/webm' }), 'speech.webm');
    const res = await fetch(`${base}/projects/${project.id}/transcribe`, { method: 'POST', body: form });
    expect((await res.json()).text).toContain('recipe');
  });

  it('explains how to fix a missing API key', async () => {
    const project = await newProject();
    const res = await send(`${keylessBase}/projects/${project.id}/generate`, 'POST', { text: 'idea' });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('OPENAI_API_KEY');
  });
});
