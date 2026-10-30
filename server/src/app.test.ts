import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyPlan, type Project } from '../../shared/plan';
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

    const first: Project = await (await send(url, 'POST', { text: 'first idea' })).json();
    expect(first.plan.requirements.length).toBeGreaterThan(0);
    expect(first.plan.boards.system.edges.length).toBeGreaterThan(0);

    const second: Project = await (await send(url, 'POST', { text: 'second idea' })).json();
    expect(second.transcript).toBe('first idea\n\nsecond idea');
    expect(second.plan.boards.system.nodes).toHaveLength(first.plan.boards.system.nodes.length);
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
