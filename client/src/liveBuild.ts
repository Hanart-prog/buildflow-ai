import { Rectangle, type FreeLayoutPluginContext, type WorkflowJSON } from '@flowgram.ai/free-layout-editor';
import type { Board, BoardName, PlanEdge, PlanNode } from '../../shared/plan';
import { NODE_HEIGHT, NODE_WIDTH, layoutBoard } from './layout';

export const NODE_TYPE = 'card';

const STEP_MS = 110;
const GLIDE = 0.16;
const MAX_FIT_ZOOM = 1;

type Point = { x: number; y: number };
export type BoardItem = { node: PlanNode } | { edge: PlanEdge };
export type LiveBoard = {
  add: (item: BoardItem) => void;
  finish: (final: Board) => Promise<void>;
  dispose: () => void;
};

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const toNodeJson = (n: PlanNode) => ({
  id: n.id,
  type: NODE_TYPE,
  meta: { position: { x: n.x ?? 0, y: n.y ?? 0 } },
  data: { label: n.label, description: n.description, kind: n.kind, details: n.details },
});

export const toEdgeJson = (e: PlanEdge) => ({
  sourceNodeID: e.source,
  targetNodeID: e.target,
  data: { label: e.label },
});

export const toBoard = (json: WorkflowJSON): Board => ({
  nodes: json.nodes.map((n) => ({
    id: n.id,
    label: n.data.label,
    description: n.data.description ?? '',
    kind: n.data.kind,
    details: n.data.details,
    x: n.meta?.position?.x,
    y: n.meta?.position?.y,
  })),
  edges: json.edges.map((e) => ({
    id: `${e.sourceNodeID}->${e.targetNodeID}`,
    source: e.sourceNodeID,
    target: e.targetNodeID,
    label: e.data?.label,
  })),
});

// Screen space the floating panels cover, so fitted nodes land clear of them.
const fitMargins = () => ({
  top: 96,
  right: 40,
  bottom: 170,
  left: window.innerWidth > 900 ? 345 : 30,
});

function fitPoints(ctx: FreeLayoutPluginContext, points: Point[], easing: boolean) {
  if (points.length === 0) return;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  // FlowGram positions a node by its top center.
  const [x, y] = [Math.min(...xs) - NODE_WIDTH / 2, Math.min(...ys)];
  const width = Math.max(...xs) + NODE_WIDTH / 2 - x;
  const height = Math.max(...ys) + NODE_HEIGHT - y;

  const { top, right, bottom, left } = fitMargins();
  const { width: screenWidth, height: screenHeight } = ctx.playground.config.getViewport(false);
  const zoom = Math.min(
    MAX_FIT_ZOOM,
    (screenWidth - left - right) / width,
    (screenHeight - top - bottom) / height,
  );
  // Fits to a slack rectangle around the nodes that matches the panel margins.
  const slackX = (screenWidth / zoom - width) * (left / (left + right));
  const slackY = (screenHeight / zoom - height) * (top / (top + bottom));
  const view = new Rectangle(x - slackX, y - slackY, screenWidth / zoom, screenHeight / zoom);
  ctx.playground.config.fitView(view, easing, 0);
}

export function fit(ctx: FreeLayoutPluginContext, easing = true) {
  const { nodes } = ctx.document.toJSON();
  fitPoints(ctx, nodes.map((n) => ({ x: n.meta?.position?.x ?? 0, y: n.meta?.position?.y ?? 0 })), easing);
}

type Hooks = {
  onStart: () => void;
  onProgress: (placed: number) => void;
  onDone: (board: Board) => void;
};

// Draws items onto the canvas as they arrive. Arrival is paced so a burst stays
// readable, and every node glides to wherever the graph so far says it belongs.
export function createLiveBuild(
  ctx: FreeLayoutPluginContext,
  name: BoardName,
  start: Board,
  hooks: Hooks,
) {
  const nodes = [...start.nodes];
  const edges = [...start.edges];
  const fixed = new Set(start.nodes.map((n) => n.id));
  const current = new Map<string, Point>();
  const targets = new Map<string, Point>();
  const queue: BoardItem[] = [];
  let started = false;
  let placed = 0;
  let pump: number | undefined;
  let frame: number | undefined;
  let final: { board: Board; resolve: () => void } | undefined;

  const allPoints = () => [
    ...start.nodes.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0 })),
    ...targets.values(),
  ];

  const relayout = () => {
    const unplaced = nodes.map((n) => (fixed.has(n.id) ? n : { ...n, x: undefined, y: undefined }));
    layoutBoard({ nodes: unplaced, edges }, name)
      .nodes.filter((n) => !fixed.has(n.id))
      .forEach((n) => targets.set(n.id, { x: n.x!, y: n.y! }));
  };

  const glide = () => {
    let moving = false;
    const rate = reducedMotion() ? 1 : GLIDE;
    targets.forEach((target, id) => {
      const from = current.get(id);
      if (!from) return;
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        if (dx !== 0 || dy !== 0) ctx.operation.updateNodePosition(id, target);
        current.set(id, target);
        return;
      }
      moving = true;
      const next = { x: from.x + dx * rate, y: from.y + dy * rate };
      current.set(id, next);
      ctx.operation.updateNodePosition(id, next);
    });
    frame = moving ? requestAnimationFrame(glide) : undefined;
  };

  const draw = (item: BoardItem) => {
    if ('node' in item) {
      if (nodes.some((n) => n.id === item.node.id)) return;
      nodes.push(item.node);
      relayout();
      const point = targets.get(item.node.id)!;
      current.set(item.node.id, point);
      ctx.document.createWorkflowNode(toNodeJson({ ...item.node, ...point }));
      placed += 1;
      hooks.onProgress(placed);
    } else {
      const { edge } = item;
      if (edges.some((e) => e.id === edge.id)) return;
      if (![edge.source, edge.target].every((id) => nodes.some((n) => n.id === id))) return;
      edges.push(edge);
      relayout();
      ctx.document.linesManager.createLine({
        from: edge.source,
        to: edge.target,
        data: { label: edge.label },
      });
    }
    fitPoints(ctx, allPoints(), !reducedMotion());
    frame ??= requestAnimationFrame(glide);
  };

  // The server's finished board is the truth; anything streamed differently
  // because of a retry or the merge is corrected here.
  const reconcile = (board: Board) => {
    const missing: BoardItem[] = [
      ...board.nodes.filter((n) => !nodes.some((m) => m.id === n.id)).map((node) => ({ node })),
      ...board.edges.filter((e) => !edges.some((m) => m.id === e.id)).map((edge) => ({ edge })),
    ];
    if (missing.length > 0) {
      queue.push(...missing);
      return false;
    }
    const nodeIds = new Set(board.nodes.map((n) => n.id));
    const edgeIds = new Set(board.edges.map((e) => e.id));
    ctx.document.linesManager.getAllLines().forEach((line) => {
      if (!edgeIds.has(`${line.from?.id}->${line.to?.id}`)) line.dispose();
    });
    ctx.document.getAllNodes().forEach((node) => {
      if (!nodeIds.has(node.id)) node.dispose();
    });
    return true;
  };

  const complete = () => {
    cancelAnimationFrame(frame ?? 0);
    frame = undefined;
    targets.forEach((target, id) => ctx.operation.updateNodePosition(id, target));
    ctx.playground.config.readonly = false;
    ctx.document.linesManager.forceUpdate();
    hooks.onDone(toBoard(ctx.document.toJSON()));
    fit(ctx);
    final?.resolve();
  };

  const step = () => {
    const item = queue.shift();
    if (item) {
      draw(item);
      pump = window.setTimeout(step, STEP_MS);
      return;
    }
    pump = undefined;
    if (!final) return;
    if (reconcile(final.board)) complete();
    else pump = window.setTimeout(step, STEP_MS);
  };

  const wake = () => {
    if (!started) {
      started = true;
      ctx.playground.config.readonly = true;
      hooks.onStart();
    }
    pump ??= window.setTimeout(step, 0);
  };

  return {
    add(item: BoardItem) {
      queue.push(item);
      wake();
    },
    finish(board: Board) {
      return new Promise<void>((resolve) => {
        final = { board, resolve };
        wake();
      });
    },
    dispose() {
      clearTimeout(pump);
      cancelAnimationFrame(frame ?? 0);
      queue.length = 0;
      final?.resolve();
    },
  };
}
