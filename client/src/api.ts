import type { Plan, Project, ProjectSummary } from '../../shared/plan';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  list: () => request<ProjectSummary[]>('/projects'),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (name: string) => request<Project>('/projects', json('POST', { name })),
  savePlan: (id: string, plan: Plan) => request<Project>(`/projects/${id}`, json('PUT', { plan })),
  remove: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  generate: (id: string, text: string) =>
    request<Project>(`/projects/${id}/generate`, json('POST', { text })),
  transcribe: (id: string, audio: Blob) => {
    const form = new FormData();
    form.append('audio', audio, 'speech');
    return request<{ text: string }>(`/projects/${id}/transcribe`, { method: 'POST', body: form });
  },
};
