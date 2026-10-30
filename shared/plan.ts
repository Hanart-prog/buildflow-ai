import { z } from 'zod';

export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(['functional', 'non-functional', 'constraint', 'open-question']),
});

// A follow-up question. An answer becomes a decision once a build has used it;
// one that goes unanswered is skipped, and stays only so it is never asked again.
export const questionSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  text: z.string().min(1),
  options: z.array(z.string()).default([]),
  answer: z.string().optional(),
  used: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

export const nodeDetailsSchema = z.object({
  summary: z.string(),
  sections: z.array(z.object({ title: z.string().min(1), items: z.array(z.string()) })),
});

export const nodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  kind: z.string().min(1),
  details: nodeDetailsSchema.optional(),
  collapsed: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
});

export const boardSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

// Ties a feature to the system parts and roadmap steps that deliver it.
export const linkSchema = z.object({
  feature: z.string().min(1),
  system: z.array(z.string()).default([]),
  roadmap: z.array(z.string()).default([]),
});

export const planSchema = z.object({
  requirements: z.array(requirementSchema),
  links: z.array(linkSchema).default([]),
  questions: z.array(questionSchema).default([]),
  boards: z.object({
    system: boardSchema,
    features: boardSchema,
    roadmap: boardSchema,
  }),
  // Mockup screens as one text, split by parseScreens. Plans saved before
  // previews existed have none.
  preview: z.string().default(''),
});

// A project plans a whole product; a feature plans one addition to a product.
export const scopeSchema = z.enum(['project', 'feature']);

// The node a build should attach to, when the user is extending just one.
export const focusSchema = z.object({
  board: z.enum(['system', 'features', 'roadmap']),
  nodeId: z.string().min(1),
});

export type Focus = z.infer<typeof focusSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Question = z.infer<typeof questionSchema>;
export type NodeDetails = z.infer<typeof nodeDetailsSchema>;
export type PlanNode = z.infer<typeof nodeSchema>;
export type PlanEdge = z.infer<typeof edgeSchema>;
export type Board = z.infer<typeof boardSchema>;
export type Plan = z.infer<typeof planSchema>;
export type BoardName = keyof Plan['boards'];

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export type Project = ProjectSummary & {
  transcript: string;
  shareId: string | null;
  plan: Plan;
};

// One line of the newline-delimited JSON stream from the generate endpoint.
export type GenerateEvent =
  | { type: 'requirements'; requirements: Requirement[]; questions: Question[] }
  | { type: 'node'; board: BoardName; node: PlanNode }
  | { type: 'edge'; board: BoardName; edge: PlanEdge }
  | { type: 'done'; project: Project }
  | { type: 'error'; error: string };

export type PreviewEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; project: Project }
  | { type: 'error'; error: string };

export type LinkedNode = { board: BoardName; id: string; label: string };

// The nodes on other boards tied to this one, in either direction.
export function linkedNodes(plan: Plan, board: BoardName, id: string): LinkedNode[] {
  const links = (plan.links ?? []).filter((link) =>
    board === 'features' ? link.feature === id : link[board].includes(id),
  );
  const ids: [BoardName, string][] = links.flatMap((link) =>
    board === 'features'
      ? [
          ...link.system.map((n): [BoardName, string] => ['system', n]),
          ...link.roadmap.map((n): [BoardName, string] => ['roadmap', n]),
        ]
      : [['features', link.feature]],
  );
  const unique = [...new Map(ids.map((entry) => [entry.join(':'), entry])).values()];
  return unique.flatMap(([linked, nodeId]) => {
    const node = plan.boards[linked].nodes.find((n) => n.id === nodeId);
    return node ? [{ board: linked, id: nodeId, label: node.label }] : [];
  });
}

// Everything below a collapsed node, unless it is that node's own parent.
export function hiddenByCollapse(board: Board) {
  const hidden = new Set<string>();
  const hide = (id: string) => {
    for (const edge of board.edges) {
      if (edge.source === id && !hidden.has(edge.target)) {
        hidden.add(edge.target);
        hide(edge.target);
      }
    }
  };
  board.nodes.filter((n) => n.collapsed).forEach((n) => hide(n.id));
  return hidden;
}

export type SharedPlan = { name: string; plan: Plan };

export type Screen = { name: string; device: 'mobile' | 'desktop'; html: string };

const SCREEN_MARKER = /<!--\s*screen:\s*(.+?)\s*\|\s*(mobile|desktop)\s*-->/g;

export function parseScreens(preview: string): Screen[] {
  const markers = [...preview.matchAll(SCREEN_MARKER)];
  return markers.map((marker, i) => ({
    name: marker[1],
    device: marker[2] as Screen['device'],
    html: preview.slice(marker.index + marker[0].length, markers[i + 1]?.index).trim(),
  }));
}

export const emptyPlan = (): Plan => ({
  preview: '',
  links: [],
  questions: [],
  requirements: [],
  boards: {
    system: { nodes: [], edges: [] },
    features: { nodes: [], edges: [] },
    roadmap: { nodes: [], edges: [] },
  },
});
