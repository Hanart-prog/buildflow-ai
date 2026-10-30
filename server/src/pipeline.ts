import { z } from 'zod';
import { SCREEN_KIT_GUIDE } from '../../shared/screenKit';
import { createBoardScanner, type ScannedItem } from './boardScanner';
import {
  linkSchema,
  nodeDetailsSchema,
  nodeSchema,
  parseScreens,
  questionSchema,
  requirementSchema,
  type Board,
  type BoardName,
  type Focus,
  type GenerateEvent,
  type NodeDetails,
  type Plan,
  type PlanNode,
  type Question,
  type Requirement,
  type Scope,
} from '../../shared/plan';

// Takes a system and user prompt, returns the model's raw JSON text. onDelta
// receives the same text in pieces as it is written.
export type Complete = (
  system: string,
  user: string,
  onDelta?: (delta: string) => void,
) => Promise<string>;

const MAX_QUESTIONS = 3;

const extractionSchema = z.object({
  name: z.string().trim().min(1).max(60).optional().catch(undefined),
  requirements: z.array(requirementSchema),
  questions: z.array(questionSchema.pick({ id: true, topic: true, text: true, options: true })).default([]),
});

const modelEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

const modelNodeSchema = nodeSchema.omit({ x: true, y: true, details: true });

const modelBoardSchema = z.object({
  nodes: z.array(modelNodeSchema),
  edges: z.array(modelEdgeSchema),
});

const mappingSchema = z.object({
  system: modelBoardSchema,
  features: modelBoardSchema,
  roadmap: modelBoardSchema,
  links: z.array(linkSchema).default([]),
});

export const EXTRACT_SYSTEM = `You turn spoken brainstorming into software requirements.
The input is JSON with "speech" (a raw transcript, possibly rambling), "scope", "knownRequirements", "decisions", "knownQuestions" and sometimes "existingProduct".
Return only minified JSON, with no markdown or commentary: {"name", "requirements": [{"id", "text", "type"}], "questions": [{"id", "topic", "text", "options"}]}.
- "name" is a short title for the product in 2 to 4 words, such as "Tool Lending App". Never start it with words from the speech like "I want to".
- Return only requirements that are new, never repeats of knownRequirements.
- "type" is one of: functional, non-functional, constraint, open-question.
- Use short kebab-case ids such as "req-offline-sync".
- Write each requirement as one clear sentence. Do not invent scope the speaker did not imply.
- If the speaker sounds unsure about something, record it as an open-question.
- If "scope" is "feature", the speaker is describing one addition to a product. Capture what that feature needs, not requirements for the wider product.
- If "existingProduct" is present it holds files from a product that already exists. Requirements describe what that product does today, plus anything the speech asks for.
- If "focus" is present, the speech is about extending that one part of the product. Capture only what that extension needs.
- "decisions" are choices the user has already made. Treat them as settled.
- If "askQuestions" is true, ask at most 3 follow-up questions, and only about what the speech actually describes: gaps that would change how that specific thing gets built. If the speech is clear, ask fewer or none. Never ask a general checklist question about the wider product.
- If "askQuestions" is false, return an empty "questions" list.
- "topic" is a short word such as Tech stack, Design, Users, Data or Platform. "options" holds 2 to 4 short, likely answers. Write questions a non-expert can answer.
- Never ask anything in knownQuestions or already settled by decisions.`;

export const MAP_SYSTEM = `You are a software architect turning requirements into three linked plans.
The input is JSON with "requirements", "decisions", "scope", "existingBoards" and sometimes "focus".
Return only minified JSON, with no markdown or commentary: {"system": Board, "features": Board, "roadmap": Board, "links": [{"feature", "system", "roadmap"}]}.
Board is {"nodes": [{"id", "label", "description", "kind"}], "edges": [{"source", "target", "label"}]}.
- system: the architecture. kind is one of client, service, database, external, queue. Edges are data or control flow, labelled with what passes along them.
- features: a hierarchy. kind is one of epic, feature, task. Edges run parent to child.
- roadmap: delivery order. kind is one of phase, milestone. Edges run prerequisite to dependent, including across phases.
- Every requirement must be covered by at least one feature.
- links comes last, with one entry per new feature-kind node: "feature" is its id, "system" lists the system node ids it touches and "roadmap" the roadmap node ids that ship it. Use exact node ids, never labels. These may be existing ids.
- "decisions" are the user's settled choices. Follow them, naming chosen technology in labels and descriptions.
- existingBoards are already saved. Return only what is new: new nodes, and edges that involve a new node. Edges may reference existing node ids.
- If "focus" is present, the user is extending that one node. You must add at least 2 new nodes on focus.board, and every one must build on it: connect the new top-level nodes from focus.id. On the other boards, add only what this extension needs.
- Use short kebab-case ids, unique within a board. Labels are 2 to 5 words. Descriptions are at most 8 words, and may be empty.
- Add at most 8 system, 14 features and 8 roadmap nodes, written before that board's edges. Every system edge needs its label; omit "label" on features and roadmap edges.
- If "scope" is "project", plan the whole product from scratch.
- If "scope" is "feature", plan only that feature: the components it adds or changes, its work breakdown and its delivery steps. Do not add unrelated parts of the product, and connect the new nodes to the existingBoards nodes they build on.`;

export const DETAILS_SYSTEM = `You are a principal engineer writing the detailed spec for one node of a software plan.
The input is JSON with "product", "board", "node", "connections", "requirements" and "decisions".
Return only minified JSON, with no markdown or commentary: {"summary": string, "sections": [{"title": string, "items": [string]}]}.
- "summary" is 2 sentences on what this node is and why it exists.
- Write 4 to 5 sections with 3 to 5 concrete items each, specific to this product. Name real technologies, fields, endpoints, screens and limits.
- system node sections: Responsibilities, Tech stack, Data and APIs, Key decisions, Risks.
- features node sections: User stories, Acceptance criteria, Design notes, Edge cases, Technical notes.
- roadmap node sections: Deliverables, Depends on, Done when, Risks.
- Follow "decisions" exactly. Where something is undecided, recommend one option and say why.`;

export const PREVIEW_SYSTEM = `You are a senior product designer making static, high-fidelity mockups of an app that does not exist yet.
The input is JSON with "name", "requirements", "system" and "features".
Design the 3 screens that best show what using this product feels like.
- Before each screen write exactly one line: <!-- screen: Screen Name | mobile --> or <!-- screen: Screen Name | desktop -->. Use one device for all screens, whichever suits the product.
- Then write the palette and the screen's body markup, for a viewport of 390x780 on mobile or 1280x800 on desktop.
- Fill the screen: several cards, chips, stats and real detail, so it feels lived in.
- Use realistic, specific sample content from this product. Never use lorem ipsum or placeholder names.
- Output only the screens, with no markdown or commentary. No <script>, <img>, or external URLs.
- Keep each screen under 2500 characters, and finish all 3 screens.

${SCREEN_KIT_GUIDE}`;

// The screens are a concept, so a preview only needs the shape of the plan.
export const previewInput = (name: string, plan: Plan) =>
  JSON.stringify({
    name,
    requirements: plan.requirements.map((r) => r.text),
    system: plan.boards.system.nodes.map((n) => `${n.kind}: ${n.label}`),
    features: plan.boards.features.nodes.filter((n) => n.kind !== 'task').map((n) => n.label),
  });

export async function runPreview(
  name: string,
  plan: Plan,
  complete: Complete,
  onDelta: (delta: string) => void,
): Promise<string> {
  const reply = await complete(PREVIEW_SYSTEM, previewInput(name, plan), onDelta);
  if (parseScreens(reply).length === 0) throw new Error('The model did not return any screens');
  return reply;
}

async function completeJson<T>(
  complete: Complete,
  system: string,
  user: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  listener?: () => (delta: string) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user : `${user}\n\nYour last reply was invalid: ${lastError}`;
    const reply = await complete(system, prompt, listener?.());
    try {
      return schema.parse(JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Model returned invalid output: ${lastError}`);
}

// The existing board always wins, so a regeneration can add to the plan but
// never undo what the user edited, moved or drew by hand.
export function mergeBoard(existing: Board, generated: z.infer<typeof modelBoardSchema>): Board {
  const nodes = new Map(existing.nodes.map((n) => [n.id, n]));
  for (const node of generated.nodes) {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  }

  const edges = new Map(existing.edges.map((e) => [`${e.source}->${e.target}`, e]));
  for (const edge of generated.edges) {
    const id = `${edge.source}->${edge.target}`;
    // Models sometimes reference nodes they never declared.
    const valid = nodes.has(edge.source) && nodes.has(edge.target) && edge.source !== edge.target;
    if (valid && !edges.has(id)) edges.set(id, { ...edge, id });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// Links only stay if every end still exists, since models invent ids or write
// a node's label where its id belongs.
export function mergeLinks(existing: Plan['links'], generated: Plan['links'], boards: Plan['boards']) {
  const resolve = (board: BoardName, value: string) =>
    boards[board].nodes.find((n) => n.id === value || n.label.toLowerCase() === value.toLowerCase())?.id;
  const resolved = (board: BoardName, values: string[]) =>
    values.flatMap((value) => resolve(board, value) ?? []);

  const merged = new Map(existing.map((link) => [link.feature, link]));
  for (const link of generated) {
    const feature = resolve('features', link.feature);
    if (!feature) continue;
    const known = merged.get(feature);
    merged.set(feature, {
      feature,
      system: [...new Set([...(known?.system ?? []), ...resolved('system', link.system)])],
      roadmap: [...new Set([...(known?.roadmap ?? []), ...resolved('roadmap', link.roadmap)])],
    });
  }
  return [...merged.values()];
}

const withoutLayout = (board: Board) => ({
  nodes: board.nodes.map(({ x, y, details, ...node }) => node),
  edges: board.edges.map(({ source, target, label }) => ({ source, target, label })),
});

// Models sometimes leave new nodes floating, or hang them off a different node,
// so any new branch that does not lead back to the chosen node is linked to it.
export function attachToFocus(before: Board, after: Board, focusId: string): Board {
  const known = new Set(before.nodes.map((n) => n.id));
  const edges = [...after.edges];

  const reachable = new Set([focusId]);
  const walk = () => {
    for (let grew = true; grew; ) {
      grew = false;
      for (const e of edges) {
        if (reachable.has(e.source) && !reachable.has(e.target)) {
          reachable.add(e.target);
          grew = true;
        }
      }
    }
  };
  walk();

  const feedsFocus = new Set(after.edges.filter((e) => e.target === focusId).map((e) => e.source));
  for (const node of after.nodes) {
    if (known.has(node.id) || reachable.has(node.id) || feedsFocus.has(node.id)) continue;
    // A node under another new node is reached through that node's branch.
    if (edges.some((e) => e.target === node.id && !known.has(e.source))) continue;
    edges.push({ id: `${focusId}->${node.id}`, source: focusId, target: node.id });
    walk();
  }
  return { ...after, edges };
}

const decisionsOf = (questions: Question[]) =>
  questions.filter((q) => q.answer).map((q) => `${q.text} ${q.answer}`);

export async function runDetails(
  project: { name: string; plan: Plan },
  board: BoardName,
  node: PlanNode,
  complete: Complete,
): Promise<NodeDetails> {
  const { name, plan } = project;
  const labels = new Map(plan.boards[board].nodes.map((n) => [n.id, n.label]));
  const connections = plan.boards[board].edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => `${labels.get(e.source)} -> ${labels.get(e.target)}${e.label ? ` (${e.label})` : ''}`);

  return completeJson(
    complete,
    DETAILS_SYSTEM,
    JSON.stringify({
      product: name,
      board,
      node: { label: node.label, kind: node.kind, description: node.description },
      connections,
      requirements: plan.requirements.map((r) => r.text),
      decisions: decisionsOf(plan.questions ?? []),
    }),
    nodeDetailsSchema,
  );
}

type PipelineOptions = {
  scope?: Scope;
  focus?: Focus;
  // Off when the speech is only answers, so one round cannot lead to another.
  askQuestions?: boolean;
  // Text from an existing product's files, when one was dropped in.
  source?: string;
  // Called as soon as requirements are known, before the slower mapping stage.
  onRequirements?: (requirements: Requirement[], questions: Question[]) => void;
  // Called with the title the model gave the product.
  onName?: (name: string) => void;
  // Called with each new node and edge while the model is still writing.
  // The returned plan is the final word: a retry or the merge can differ.
  onItem?: (item: Extract<GenerateEvent, { type: 'node' | 'edge' }>) => void;
};

// Reports only what the model adds, once each, across retries.
function itemReporter(existing: Plan, onItem: NonNullable<PipelineOptions['onItem']>) {
  const known = {
    system: new Set(existing.boards.system.nodes.map((n) => n.id)),
    features: new Set(existing.boards.features.nodes.map((n) => n.id)),
    roadmap: new Set(existing.boards.roadmap.nodes.map((n) => n.id)),
  };
  const reported = new Set<string>();

  return ({ board, list, value }: ScannedItem) => {
    if (!(board in known)) return;
    if (list === 'nodes') {
      const node = modelNodeSchema.safeParse(value);
      if (!node.success || known[board].has(node.data.id)) return;
      known[board].add(node.data.id);
      onItem({ type: 'node', board, node: node.data });
    } else if (list === 'edges') {
      const edge = modelEdgeSchema.safeParse(value);
      if (!edge.success) return;
      const { source, target } = edge.data;
      const id = `${source}->${target}`;
      const key = `${board}:${id}`;
      if (reported.has(key) || existing.boards[board].edges.some((e) => e.id === id)) return;
      if (!known[board].has(source) || !known[board].has(target) || source === target) return;
      reported.add(key);
      onItem({ type: 'edge', board, edge: { ...edge.data, id } });
    }
  };
}

export async function runPipeline(
  speech: string,
  existing: Plan,
  complete: Complete,
  { scope = 'project', focus, askQuestions = true, source, onRequirements, onName, onItem }: PipelineOptions = {},
): Promise<Plan> {
  const focusNode = focus && existing.boards[focus.board].nodes.find((n) => n.id === focus.nodeId);
  const focusInput = focus &&
    focusNode && { board: focus.board, id: focusNode.id, label: focusNode.label, description: focusNode.description };

  // Plans saved before questions existed have none.
  const asked = existing.questions ?? [];
  const decisions = decisionsOf(asked);

  const { name, requirements: extracted, questions: followUps } = await completeJson(
    complete,
    EXTRACT_SYSTEM,
    JSON.stringify({
      speech,
      scope,
      knownRequirements: existing.requirements,
      decisions,
      knownQuestions: asked.map((q) => q.text),
      askQuestions,
      focus: focusInput,
      existingProduct: source,
    }),
    extractionSchema,
  );

  if (name) onName?.(name);

  const known = new Set(existing.requirements.map((r) => r.id));
  const requirements = [...existing.requirements, ...extracted.filter((r) => !known.has(r.id))];

  const askedIds = new Set(asked.map((q) => q.id));
  const questions = [
    ...asked.map((q) => (q.answer ? { ...q, used: true } : { ...q, skipped: true })),
    ...(askQuestions ? followUps.filter((q) => !askedIds.has(q.id)).slice(0, MAX_QUESTIONS) : []),
  ];
  onRequirements?.(requirements, questions);

  const boardNames: BoardName[] = ['system', 'features', 'roadmap'];
  const report = onItem && itemReporter(existing, onItem);
  const mapped = await completeJson(
    complete,
    MAP_SYSTEM,
    JSON.stringify({
      requirements,
      decisions,
      scope,
      focus: focusInput,
      existingBoards: Object.fromEntries(
        boardNames.map((name) => [name, withoutLayout(existing.boards[name])]),
      ),
    }),
    mappingSchema,
    report && (() => createBoardScanner(report)),
  );

  const boards = {
    system: mergeBoard(existing.boards.system, mapped.system),
    features: mergeBoard(existing.boards.features, mapped.features),
    roadmap: mergeBoard(existing.boards.roadmap, mapped.roadmap),
  };
  if (focus && focusNode) {
    boards[focus.board] = attachToFocus(existing.boards[focus.board], boards[focus.board], focus.nodeId);
  }

  return { ...existing, requirements, questions, boards, links: mergeLinks(existing.links ?? [], mapped.links, boards) };
}
