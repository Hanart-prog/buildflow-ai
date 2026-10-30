import { describe, expect, it } from 'vitest';
import { buildPrompt, planMarkdown } from '../../shared/exportPlan';
import { emptyPlan, hiddenByCollapse, linkedNodes, parseScreens, type Plan } from '../../shared/plan';
import { keepPaletteOnly } from '../../shared/screenKit';
import { createBoardScanner, type ScannedItem } from './boardScanner';
import { DETAILS_SYSTEM, EXTRACT_SYSTEM, attachToFocus, mergeLinks, runDetails, runPipeline, runPreview, type Complete } from './pipeline';

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

// Replies one character at a time, the worst case for splitting across deltas.
const streamed = (...replies: string[]): Complete => {
  const queue = [...replies];
  return async (_system, _user, onDelta) => {
    const reply = queue.shift() ?? '';
    for (const char of reply) onDelta?.(char);
    return reply;
  };
};

describe('questions and details', () => {
  const withQuestion = {
    ...extraction,
    questions: [
      { id: 'q-new', topic: 'Design', text: 'Light or dark?', options: ['Light', 'Dark'] },
      { id: 'q-old', topic: 'Tech stack', text: 'Repeated', options: [] },
    ],
  };

  it('feeds answers to both stages and never re-adds a known question', async () => {
    const existing = emptyPlan();
    existing.questions = [
      { id: 'q-old', topic: 'Tech stack', text: 'Which stack?', options: [], answer: 'Rails' },
      { id: 'q-open', topic: 'Users', text: 'Who is it for?', options: [] },
    ];
    const inputs: { decisions: string[] }[] = [];
    const replies = [JSON.stringify(withQuestion), JSON.stringify(mapping)];
    const complete: Complete = async (_system, user) => {
      inputs.push(JSON.parse(user));
      return replies.shift()!;
    };

    const plan = await runPipeline('more', existing, complete);

    expect(inputs.map((i) => i.decisions)).toEqual([['Which stack? Rails'], ['Which stack? Rails']]);
    expect(plan.questions.map((q) => q.id)).toEqual(['q-old', 'q-open', 'q-new']);
    expect(plan.questions[0].used).toBe(true);
    expect(plan.questions[1]).toMatchObject({ skipped: true });
    expect(plan.questions[1].used).toBeUndefined();
  });

  it('never asks more than 3 questions at once', async () => {
    const many = { ...extraction, questions: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, topic: 'Design', text: id, options: [] })) };
    const plan = await runPipeline('x', emptyPlan(), scripted(JSON.stringify(many), JSON.stringify(mapping)));
    expect(plan.questions).toHaveLength(3);
  });

  it('asks nothing new on a build that only uses answers', async () => {
    const inputs: { askQuestions: boolean }[] = [];
    const replies = [JSON.stringify(withQuestion), JSON.stringify(mapping)];
    const plan = await runPipeline('answers', emptyPlan(), async (_s, user) => {
      inputs.push(JSON.parse(user));
      return replies.shift()!;
    }, { askQuestions: false });
    expect(inputs[0].askQuestions).toBe(false);
    expect(plan.questions).toEqual([]);
  });

  it('handles plans saved before questions existed', async () => {
    const { questions: _none, ...old } = emptyPlan();
    const plan = await runPipeline('x', old as Plan, good());
    expect(plan.questions).toEqual([]);
  });

  it('keeps details out of the prompt but on the saved node', async () => {
    const existing = emptyPlan();
    const details = { summary: 'secret-detail', sections: [] };
    existing.boards.system.nodes = [{ id: 'web', label: 'Web', description: '', kind: 'client', x: 0, y: 0, details }];
    const prompts: string[] = [];
    const replies = [JSON.stringify(extraction), JSON.stringify(mapping)];
    const plan = await runPipeline('x', existing, async (_s, user) => {
      prompts.push(user);
      return replies.shift()!;
    });
    expect(prompts.join()).not.toContain('secret-detail');
    expect(plan.boards.system.nodes.find((n) => n.id === 'web')?.details).toEqual(details);
  });

  it('gives the details writer the node, its connections and the decisions', async () => {
    const plan = emptyPlan();
    plan.boards.system.nodes = [
      { id: 'a', label: 'Web', description: '', kind: 'client' },
      { id: 'b', label: 'API', description: '', kind: 'service' },
    ];
    plan.boards.system.edges = [{ id: 'a->b', source: 'a', target: 'b', label: 'REST' }];
    plan.questions = [{ id: 'q', topic: 'Tech stack', text: 'Stack?', options: [], answer: 'Go' }];
    let input = '';
    const complete: Complete = async (system, user) => {
      expect(system).toBe(DETAILS_SYSTEM);
      input = user;
      return JSON.stringify({ summary: 's', sections: [{ title: 't', items: ['i'] }] });
    };

    const details = await runDetails({ name: 'App', plan }, 'system', plan.boards.system.nodes[1], complete);

    expect(details.summary).toBe('s');
    expect(JSON.parse(input)).toMatchObject({ connections: ['Web -> API (REST)'], decisions: ['Stack? Go'] });
  });
});

describe('extending one node', () => {
  const node = (id: string) => ({ id, label: id, description: '', kind: 'service' });
  const before = { nodes: [node('focus'), node('other')], edges: [] };

  it('links only the new nodes nothing else reaches', () => {
    const after = {
      nodes: [...before.nodes, node('a'), node('b'), node('c')],
      edges: [
        { id: 'focus->a', source: 'focus', target: 'a' },
        { id: 'a->b', source: 'a', target: 'b' },
      ],
    };
    expect(attachToFocus(before, after, 'focus').edges.map((e) => e.id)).toEqual([
      'focus->a',
      'a->b',
      'focus->c',
    ]);
  });

  it('links a new branch the model hung off a different node', () => {
    const after = {
      nodes: [...before.nodes, node('a'), node('b')],
      edges: [
        { id: 'other->a', source: 'other', target: 'a' },
        { id: 'a->b', source: 'a', target: 'b' },
      ],
    };
    expect(attachToFocus(before, after, 'focus').edges.map((e) => e.id)).toEqual([
      'other->a',
      'a->b',
      'focus->a',
    ]);
  });

  it('leaves a node that already feeds into the focus alone', () => {
    const after = {
      nodes: [...before.nodes, node('a')],
      edges: [{ id: 'a->focus', source: 'a', target: 'focus' }],
    };
    expect(attachToFocus(before, after, 'focus').edges).toHaveLength(1);
  });

  it('tells both stages about the focus and attaches on that board only', async () => {
    const existing = emptyPlan();
    existing.boards.system.nodes = [node('web')];
    const inputs: { focus: { label: string } }[] = [];
    const replies = [JSON.stringify(extraction), JSON.stringify(mapping)];
    const plan = await runPipeline('add', existing, async (_s, user) => {
      inputs.push(JSON.parse(user));
      return replies.shift()!;
    }, { focus: { board: 'system', nodeId: 'web' } });

    expect(inputs.map((i) => i.focus.label)).toEqual(['web', 'web']);
    expect(plan.boards.system.edges.map((e) => e.id)).toEqual(['web->api']);
    expect(plan.boards.features.edges).toEqual([]);
  });
});

describe('plan tools', () => {
  const node = (id: string, kind = 'service') => ({ id, label: id.toUpperCase(), description: '', kind });
  const plan = (): Plan => {
    const p = emptyPlan();
    p.boards.system.nodes = [node('api')];
    p.boards.features.nodes = [node('search', 'feature'), node('task-a', 'task')];
    p.boards.features.edges = [{ id: 'search->task-a', source: 'search', target: 'task-a' }];
    p.boards.roadmap.nodes = [node('beta', 'milestone')];
    return p;
  };

  it('keeps only links whose ends exist, and combines repeats', () => {
    const { boards } = plan();
    const existing = [{ feature: 'search', system: ['api'], roadmap: [] }];
    const generated = [
      { feature: 'search', system: ['ghost', 'api'], roadmap: ['beta'] },
      { feature: 'ghost', system: ['api'], roadmap: [] },
    ];
    expect(mergeLinks(existing, generated, boards)).toEqual([
      { feature: 'search', system: ['api'], roadmap: ['beta'] },
    ]);
  });

  it('accepts a label where the model should have written an id', () => {
    const generated = [{ feature: 'Search', system: ['API'], roadmap: ['beta'] }];
    expect(mergeLinks([], generated, plan().boards)).toEqual([
      { feature: 'search', system: ['api'], roadmap: ['beta'] },
    ]);
  });

  it('finds linked nodes from either side and tolerates older plans', () => {
    const p = { ...plan(), links: [{ feature: 'search', system: ['api'], roadmap: ['beta'] }] };
    expect(linkedNodes(p, 'features', 'search').map((n) => n.label)).toEqual(['API', 'BETA']);
    expect(linkedNodes(p, 'system', 'api').map((n) => n.label)).toEqual(['SEARCH']);
    const { links: _none, ...old } = p;
    expect(linkedNodes(old as Plan, 'system', 'api')).toEqual([]);
  });

  it('hides everything below a collapsed node, even around a loop', () => {
    const board = plan().boards.features;
    board.nodes[0].collapsed = true;
    board.edges.push({ id: 'task-a->search', source: 'task-a', target: 'search' });
    expect([...hiddenByCollapse(board)].sort()).toEqual(['search', 'task-a']);
  });

  it('exports requirements, decisions, connections and details', () => {
    const p = plan();
    p.requirements = [{ id: 'r', text: 'Search works.', type: 'functional' }];
    p.questions = [{ id: 'q', topic: 'Tech', text: 'Stack?', options: [], answer: 'Go' }];
    p.boards.features.nodes[0].details = { summary: 'Finds things.', sections: [{ title: 'Risks', items: ['Slow'] }] };

    const markdown = planMarkdown('Finder', p);

    for (const text of ['# Finder', '[functional] Search works.', 'Stack? Go', '- TASK-A', 'Finds things.', '- Slow']) {
      expect(markdown).toContain(text);
    }
    expect(buildPrompt('Finder', p)).toContain('You are building "Finder"');
  });
});

describe('previews', () => {
  it('splits screens, including one still being written', () => {
    const text = 'intro<!-- screen: Home | mobile --><p>a</p>\n<!--screen:Sign Up|mobile--><p>b';
    expect(parseScreens(text)).toEqual([
      { name: 'Home', device: 'mobile', html: '<p>a</p>' },
      { name: 'Sign Up', device: 'mobile', html: '<p>b' },
    ]);
  });

  it('keeps only the palette from a screen\'s styles', () => {
    const html = '<style>:root{--brand:#123}.map{background:gray}</style><div class="map"></div><style>.chip{color:#fff}</style><p>';
    expect(keepPaletteOnly(html)).toBe('<style>:root{--brand:#123}</style><div class="map"></div><p>');
  });

  it('keeps inline positions but drops other inline styling', () => {
    const html = '<div class="map" style="background:#ddd"><i class="pin" style="left:40%;top:30%;color:red"></i></div>';
    expect(keepPaletteOnly(html)).toBe('<div class="map"><i class="pin" style="left:40%;top:30%"></i></div>');
  });

  it('handles a style tag that is still being written', () => {
    expect(keepPaletteOnly('<p>a</p><style>.map{back')).toBe('<p>a</p>');
  });

  it('fails when the reply has no screens', async () => {
    await expect(runPreview('App', emptyPlan(), scripted('<p>hi</p>'), () => {})).rejects.toThrow('any screens');
  });
});

describe('createBoardScanner', () => {
  const scan = (text: string) => {
    const items: ScannedItem[] = [];
    const feed = createBoardScanner((item) => items.push(item));
    for (const char of text) feed(char);
    return items;
  };

  it('reports only complete items, in order', () => {
    const items = scan('{"system":{"nodes":[{"id":"a"},{"id":"b"}],"edges":[{"source":"a","target":"b"}]},"roadmap":{"nodes":[{"id":"c"');
    expect(items.map((i) => [i.board, i.list])).toEqual([
      ['system', 'nodes'],
      ['system', 'nodes'],
      ['system', 'edges'],
    ]);
  });

  it('is not fooled by braces and quotes inside strings', () => {
    const value = { id: 'a', description: 'uses {curly} "quotes" ] and \\ slashes' };
    expect(scan(JSON.stringify({ system: { nodes: [value] } }))[0].value).toEqual(value);
  });

  it('handles pretty-printed replies', () => {
    expect(scan(JSON.stringify({ features: { nodes: [{ id: 'a' }], edges: [] } }, null, 2))).toHaveLength(1);
  });
});

describe('runPipeline', () => {
  it('reports each new item while the model is writing', async () => {
    const events: { type: string }[] = [];
    await runPipeline('login', emptyPlan(), streamed(JSON.stringify(extraction), JSON.stringify(mapping)), {
      onItem: (event) => events.push(event),
    });
    expect(events).toEqual([
      { type: 'node', board: 'system', node: mapping.system.nodes[0] },
      { type: 'node', board: 'system', node: mapping.system.nodes[1] },
      { type: 'edge', board: 'system', edge: { ...mapping.system.edges[0], id: 'web->api' } },
    ]);
  });

  it('does not report what already exists, or repeat items on a retry', async () => {
    const existing = emptyPlan();
    existing.boards.system.nodes = [{ id: 'web', label: 'Web', description: '', kind: 'client', x: 0, y: 0 }];
    const truncated = JSON.stringify(mapping).slice(0, -20);
    const ids: string[] = [];

    await runPipeline(
      'login',
      existing,
      streamed(JSON.stringify(extraction), truncated, JSON.stringify(mapping)),
      { onItem: (event) => ids.push(event.type === 'node' ? event.node.id : event.edge.id) },
    );

    expect(ids).toEqual(['api', 'web->api']);
  });

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

  it('passes the scope to both stages and reports requirements early', async () => {
    const inputs: { scope: string }[] = [];
    const replies = [JSON.stringify(extraction), JSON.stringify(mapping)];
    const complete: Complete = async (_system, user) => {
      inputs.push(JSON.parse(user));
      return replies.shift()!;
    };
    const seen: string[] = [];

    await runPipeline('add login', emptyPlan(), complete, {
      scope: 'feature',
      onRequirements: (requirements) => seen.push(...requirements.map((r) => r.id)),
    });

    expect(inputs.map((i) => i.scope)).toEqual(['feature', 'feature']);
    expect(seen).toEqual(['req-a']);
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

  it('reads a reply wrapped in markdown fences', async () => {
    const fenced = '```json\n' + JSON.stringify(extraction) + '\n```';
    const plan = await runPipeline('login', emptyPlan(), scripted(fenced, JSON.stringify(mapping)));
    expect(plan.requirements).toHaveLength(1);
  });

  it('fails after a second invalid reply', async () => {
    await expect(runPipeline('x', emptyPlan(), scripted('nope', 'nope'))).rejects.toThrow(
      'invalid output',
    );
  });
});
