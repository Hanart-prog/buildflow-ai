import type {
  BoardName,
  Focus,
  GenerateEvent,
  NodeDetails,
  Plan,
  PreviewEvent,
  Project,
  ProjectSummary,
  Scope,
} from '../../shared/plan';

async function failure(res: Response) {
  const body = await res.json().catch(() => null);
  return new Error(body?.error ?? `Request failed (${res.status})`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw await failure(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

type Terminal = { type: 'done'; project: Project } | { type: 'error'; error: string };

// Reads newline-delimited events until the stream reports its result.
async function readStream<E extends Terminal | { type: string }>(
  res: Response,
  onEvent: (event: Exclude<E, Terminal>) => void,
): Promise<Project> {
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error('The connection closed before it was finished');
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === 'error') throw new Error(event.error);
      if (event.type === 'done') return event.project;
      onEvent(event);
    }
  }
}

const generate = async (
  id: string,
  text: string,
  scope: Scope,
  onEvent: (event: Exclude<GenerateEvent, Terminal>) => void,
  extra: { source?: string; focus?: Focus; askQuestions?: boolean } = {},
) =>
  readStream<GenerateEvent>(
    await fetch(`/api/projects/${id}/generate`, json('POST', { text, scope, ...extra })),
    onEvent,
  );

const preview = async (id: string, onEvent: (event: Exclude<PreviewEvent, Terminal>) => void) =>
  readStream<PreviewEvent>(await fetch(`/api/projects/${id}/preview`, { method: 'POST' }), onEvent);

export const api = {
  list: () => request<ProjectSummary[]>('/projects'),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (name: string) => request<Project>('/projects', json('POST', { name })),
  rename: (id: string, name: string) => request<Project>(`/projects/${id}`, json('PUT', { name })),
  savePlan: (id: string, plan: Plan) => request<Project>(`/projects/${id}`, json('PUT', { plan })),
  remove: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  generate,
  preview,
  details: (id: string, board: BoardName, nodeId: string) =>
    request<NodeDetails>(`/projects/${id}/details`, json('POST', { board, nodeId })),
  transcribe: (id: string, audio: Blob) => {
    const form = new FormData();
    form.append('audio', audio, 'speech');
    return request<{ text: string }>(`/projects/${id}/transcribe`, { method: 'POST', body: form });
  },
};
