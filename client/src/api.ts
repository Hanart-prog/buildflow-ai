import type { GenerateEvent, Plan, Project, ProjectSummary, Requirement, Scope } from '../../shared/plan';

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

async function generate(
  id: string,
  text: string,
  scope: Scope,
  onRequirements: (requirements: Requirement[]) => void,
): Promise<Project> {
  const res = await fetch(`/api/projects/${id}/generate`, json('POST', { text, scope }));
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error('The connection closed before the plan was finished');
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event: GenerateEvent = JSON.parse(line);
      if (event.type === 'error') throw new Error(event.error);
      if (event.type === 'done') return event.project;
      onRequirements(event.requirements);
    }
  }
}

export const api = {
  list: () => request<ProjectSummary[]>('/projects'),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (name: string) => request<Project>('/projects', json('POST', { name })),
  rename: (id: string, name: string) => request<Project>(`/projects/${id}`, json('PUT', { name })),
  savePlan: (id: string, plan: Plan) => request<Project>(`/projects/${id}`, json('PUT', { plan })),
  remove: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  generate,
  transcribe: (id: string, audio: Blob) => {
    const form = new FormData();
    form.append('audio', audio, 'speech');
    return request<{ text: string }>(`/projects/${id}/transcribe`, { method: 'POST', body: form });
  },
};
