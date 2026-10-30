import { z } from 'zod';
import {
  nodeSchema,
  requirementSchema,
  type Board,
  type BoardName,
  type Plan,
  type Requirement,
  type Scope,
} from '../../shared/plan';

// Takes a system and user prompt, returns the model's raw JSON text.
export type Complete = (system: string, user: string) => Promise<string>;

const extractionSchema = z.object({ requirements: z.array(requirementSchema) });

const modelEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

const modelBoardSchema = z.object({
  nodes: z.array(nodeSchema.omit({ x: true, y: true })),
  edges: z.array(modelEdgeSchema),
});

const mappingSchema = z.object({
  system: modelBoardSchema,
  features: modelBoardSchema,
  roadmap: modelBoardSchema,
});

export const EXTRACT_SYSTEM = `You turn spoken brainstorming into software requirements.
The input is JSON with "speech" (a raw transcript, possibly rambling), "scope" and "knownRequirements".
Return JSON: {"requirements": [{"id", "text", "type"}]}.
- Return only requirements that are new, never repeats of knownRequirements.
- "type" is one of: functional, non-functional, constraint, open-question.
- Use short kebab-case ids such as "req-offline-sync".
- Write each requirement as one clear sentence. Do not invent scope the speaker did not imply.
- If the speaker sounds unsure about something, record it as an open-question.
- If "scope" is "feature", the speaker is describing one addition to a product. Capture what that feature needs, not requirements for the wider product.`;

export const MAP_SYSTEM = `You are a software architect turning requirements into three linked plans.
The input is JSON with "requirements", "scope" and "existingBoards".
Return JSON: {"system": Board, "features": Board, "roadmap": Board}.
Board is {"nodes": [{"id", "label", "description", "kind"}], "edges": [{"source", "target", "label"}]}.
- system: the architecture. kind is one of client, service, database, external, queue. Edges are data or control flow, labelled with what passes along them.
- features: a hierarchy. kind is one of epic, feature, task. Edges run parent to child.
- roadmap: delivery order. kind is one of phase, milestone. Edges run prerequisite to dependent, including across phases.
- Every requirement must be covered by at least one feature.
- Include every node in existingBoards unchanged, keeping its id, and connect new nodes to them.
- Use short kebab-case ids, unique within a board. Labels are 2 to 5 words.
- If "scope" is "project", plan the whole product from scratch.
- If "scope" is "feature", plan only that feature: the components it adds or changes, its work breakdown and its delivery steps. Do not add unrelated parts of the product, and connect the new nodes to the existingBoards nodes they build on.`;

async function completeJson<T>(
  complete: Complete,
  system: string,
  user: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user : `${user}\n\nYour last reply was invalid: ${lastError}`;
    const reply = await complete(system, prompt);
    try {
      return schema.parse(JSON.parse(reply));
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

const withoutPositions = (board: Board) => ({
  nodes: board.nodes.map(({ x, y, ...node }) => node),
  edges: board.edges.map(({ source, target, label }) => ({ source, target, label })),
});

type PipelineOptions = {
  scope?: Scope;
  // Called as soon as requirements are known, before the slower mapping stage.
  onRequirements?: (requirements: Requirement[]) => void;
};

export async function runPipeline(
  speech: string,
  existing: Plan,
  complete: Complete,
  { scope = 'project', onRequirements }: PipelineOptions = {},
): Promise<Plan> {
  const { requirements: extracted } = await completeJson(
    complete,
    EXTRACT_SYSTEM,
    JSON.stringify({ speech, scope, knownRequirements: existing.requirements }),
    extractionSchema,
  );

  const known = new Set(existing.requirements.map((r) => r.id));
  const requirements = [...existing.requirements, ...extracted.filter((r) => !known.has(r.id))];
  onRequirements?.(requirements);

  const boardNames: BoardName[] = ['system', 'features', 'roadmap'];
  const mapped = await completeJson(
    complete,
    MAP_SYSTEM,
    JSON.stringify({
      requirements,
      scope,
      existingBoards: Object.fromEntries(
        boardNames.map((name) => [name, withoutPositions(existing.boards[name])]),
      ),
    }),
    mappingSchema,
  );

  return {
    requirements,
    boards: {
      system: mergeBoard(existing.boards.system, mapped.system),
      features: mergeBoard(existing.boards.features, mapped.features),
      roadmap: mergeBoard(existing.boards.roadmap, mapped.roadmap),
    },
  };
}
