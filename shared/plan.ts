import { z } from 'zod';

export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(['functional', 'non-functional', 'constraint', 'open-question']),
});

// A follow-up question. An answer becomes a decision once a build has used it.
export const questionSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  text: z.string().min(1),
  options: z.array(z.string()).default([]),
  answer: z.string().optional(),
  used: z.boolean().optional(),
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

export const planSchema = z.object({
  requirements: z.array(requirementSchema),
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
  questions: [],
  requirements: [],
  boards: {
    system: { nodes: [], edges: [] },
    features: { nodes: [], edges: [] },
    roadmap: { nodes: [], edges: [] },
  },
});
