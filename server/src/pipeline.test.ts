import { describe, expect, it } from 'vitest';
import { emptyPlan, type Plan } from '../../shared/plan';
import { EXTRACT_SYSTEM, runPipeline, type Complete } from './pipeline';

const extraction = { requirements: [{ id: 'req-a', text: 'Users can log in.', type: 'functional' }] };
const emptyBoard = { nodes: [], edges: [] };
const mapping = {
  system: {
    nodes: [
      { id: 'web', label: 'Web App', description: 'UI', kind: 'client' },
      { id: 'api', label: 'API', description: '', kind: 'service' },
    ],
    edges: [
      { source: 'web', target: 'api', label: 'REST' },
      { source: 'web', target: 'ghost' },
      { source: 'api', target: 'api' },
    ],
  },
  features: emptyBoard,
  roadmap: emptyBoard,
};

const scripted = (...replies: string[]): Complete => {
  const queue = [...replies];
  return async () => queue.shift() ?? '';
};

const good = () => scripted(JSON.stringify(extraction), JSON.stringify(mapping));

describe('runPipeline', () => {
  it('extracts requirements and maps them to boards', async () => {
    const plan = await runPipeline('we need login', emptyPlan(), good());
    expect(plan.requirements.map((r) => r.id)).toEqual(['req-a']);
    expect(plan.boards.system.nodes).toHaveLength(2);
  });

  it('drops edges to undeclared nodes and self-loops', async () => {
    const plan = await runPipeline('we need login', emptyPlan(), good());
    expect(plan.boards.system.edges.map((e) => e.id)).toEqual(['web->api']);
  });

  it('never overwrites existing nodes, positions or requirements', async () => {
    const existing: Plan = emptyPlan();
    existing.requirements = [{ id: 'req-a', text: 'Edited by hand.', type: 'constraint' }];
    existing.boards.system.nodes = [
      { id: 'web', label: 'Renamed', description: '', kind: 'client', x: 40, y: 80 },
      { id: 'manual', label: 'Hand drawn', description: '', kind: 'service', x: 0, y: 0 },
    ];

    const plan = await runPipeline('more', existing, good());

    expect(plan.requirements).toEqual(existing.requirements);
    const nodes = plan.boards.system.nodes;
    expect(nodes.find((n) => n.id === 'web')).toMatchObject({ label: 'Renamed', x: 40, y: 80 });
    expect(nodes.map((n) => n.id).sort()).toEqual(['api', 'manual', 'web']);
  });

  it('retries once and feeds the error back to the model', async () => {
    const prompts: string[] = [];
    const replies = ['not json', JSON.stringify(extraction), JSON.stringify(mapping)];
    const complete: Complete = async (system, user) => {
      if (system === EXTRACT_SYSTEM) prompts.push(user);
      return replies.shift()!;
    };

    await runPipeline('we need login', emptyPlan(), complete);

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('invalid');
  });

  it('fails after a second invalid reply', async () => {
    await expect(runPipeline('x', emptyPlan(), scripted('nope', 'nope'))).rejects.toThrow(
      'invalid output',
    );
  });
});
