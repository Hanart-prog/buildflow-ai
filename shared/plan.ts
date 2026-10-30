import { z } from 'zod';

export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(['functional', 'non-functional', 'constraint', 'open-question']),
});

export const nodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  kind: z.string().min(1),
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
  boards: z.object({
    system: boardSchema,
    features: boardSchema,
    roadmap: boardSchema,
  }),
});

export type Requirement = z.infer<typeof requirementSchema>;
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

export const emptyPlan = (): Plan => ({
  requirements: [],
  boards: {
    system: { nodes: [], edges: [] },
    features: { nodes: [], edges: [] },
    roadmap: { nodes: [], edges: [] },
  },
});
