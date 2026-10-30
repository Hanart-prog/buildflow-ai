import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EditorRenderer,
  Field,
  FreeLayoutEditorProvider,
  Rectangle,
  WorkflowNodeRenderer,
  WorkflowSelectService,
  getNodeForm,
  useClientContext,
  useNodeRender,
  usePlaygroundTools,
  useService,
  type FreeLayoutPluginContext,
  type FreeLayoutProps,
  type WorkflowJSON,
  type WorkflowLineEntity,
  type WorkflowNodeEntity,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor';
import { createFreeLinesPlugin } from '@flowgram.ai/free-lines-plugin';
import { createFreeSnapPlugin } from '@flowgram.ai/free-snap-plugin';
import { MinimapRender, createMinimapPlugin } from '@flowgram.ai/minimap-plugin';
import type { Board, BoardName, PlanEdge, PlanNode } from '../../shared/plan';
import { KindIcon } from './KindIcon';
import { NODE_HEIGHT, NODE_WIDTH, isHorizontal, layoutBoard } from './layout';

const KINDS: Record<BoardName, string[]> = {
  system: ['client', 'service', 'database', 'external', 'queue'],
  features: ['epic', 'feature', 'task'],
  roadmap: ['phase', 'milestone'],
};

const NODE_TYPE = 'card';
const BUILD_STEP_MS = 260;
const MAX_FIT_ZOOM = 1;
// Small boards fit on screen, where the minimap would only cover nodes.
const MINIMAP_THRESHOLD = 12;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const toNodeJson = (n: PlanNode) => ({
  id: n.id,
  type: NODE_TYPE,
  meta: { position: { x: n.x ?? 0, y: n.y ?? 0 } },
  data: { label: n.label, description: n.description, kind: n.kind },
});

const toEdgeJson = (e: PlanEdge) => ({
  sourceNodeID: e.source,
  targetNodeID: e.target,
  data: { label: e.label },
});

const toBoard = (json: WorkflowJSON): Board => ({
  nodes: json.nodes.map((n) => ({
    id: n.id,
    label: n.data.label,
    description: n.data.description ?? '',
    kind: n.data.kind,
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
  left: window.innerWidth > 900 ? 310 : 30,
});

function fit(ctx: FreeLayoutPluginContext, easing = true) {
  const { nodes } = ctx.document.toJSON();
  if (nodes.length === 0) return;
  const xs = nodes.map((n) => n.meta?.position?.x ?? 0);
  const ys = nodes.map((n) => n.meta?.position?.y ?? 0);
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

function CardBody() {
  return (
    <Field<string> name="kind">
      {({ field: kind }) => (
        <div className={`card kind-${kind.value}`}>
          <header>
            <KindIcon kind={kind.value} />
            <span>{kind.value}</span>
          </header>
          <Field<string> name="label">{({ field }) => <strong>{field.value}</strong>}</Field>
          <Field<string> name="description">
            {({ field }) => (field.value ? <p>{field.value}</p> : <></>)}
          </Field>
        </div>
      )}
    </Field>
  );
}

function CardNode(props: WorkflowNodeProps) {
  const { selected, form } = useNodeRender();
  return (
    <WorkflowNodeRenderer
      className={`node${selected ? ' selected' : ''}`}
      node={props.node}
      portPrimaryColor="#ffb38a"
      portSecondaryColor="#55708f"
      portBackgroundColor="#101a27"
    >
      {form?.render()}
    </WorkflowNodeRenderer>
  );
}

function LineLabel({ line }: { line: WorkflowLineEntity }) {
  const label: string | undefined = line.lineData?.label;
  if (!label) return null;
  const { labelX, labelY } = line.center;
  return (
    <div className="line-label" style={{ left: labelX, top: labelY }}>
      {label}
    </div>
  );
}

function Inspector({ name }: { name: BoardName }) {
  const selection = useService(WorkflowSelectService);
  const [node, setNode] = useState<WorkflowNodeEntity | undefined>();
  const [, redraw] = useState(0);

  useEffect(() => {
    const sync = () => {
      const [only, ...rest] = selection.selectedNodes;
      setNode(rest.length === 0 ? only : undefined);
    };
    const disposable = selection.onSelectionChanged(sync);
    return () => disposable.dispose();
  }, [selection]);

  const form = node && getNodeForm(node);
  if (!node || !form) return null;

  const set = (path: string, value: string) => {
    form.setValueIn(path, value);
    redraw((n) => n + 1);
  };
  const kind: string = form.getValueIn('kind');

  return (
    <aside className="inspector" key={node.id}>
      <label>
        Label
        <input value={form.getValueIn('label')} onChange={(e) => set('label', e.target.value)} />
      </label>
      <label>
        Type
        <select value={kind} onChange={(e) => set('kind', e.target.value)}>
          {[...new Set([...KINDS[name], kind])].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Description
        <textarea
          rows={4}
          value={form.getValueIn('description')}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>
      <button className="danger" onClick={() => node.dispose()}>
        Delete node
      </button>
    </aside>
  );
}

function Tools({ name, onTidy }: { name: BoardName; onTidy: (board: Board) => void }) {
  const ctx = useClientContext();
  const tools = usePlaygroundTools();
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(ctx.document.getAllNodes().length);
    sync();
    const changes = ctx.document.onContentChange(sync);
    const stack = ctx.history.undoRedoService.onChange(() =>
      setHistory({ undo: ctx.history.canUndo(), redo: ctx.history.canRedo() }),
    );
    return () => {
      changes.dispose();
      stack.dispose();
    };
  }, [ctx]);

  const addNode = () => {
    const { center } = ctx.playground.config.getViewport(true);
    const node = ctx.document.createWorkflowNodeByType(
      NODE_TYPE,
      { x: center.x, y: center.y - NODE_HEIGHT / 2 },
      { data: { label: 'New node', description: '', kind: KINDS[name][0] } },
    );
    ctx.selection.selection = [node];
  };

  const tidy = () => {
    const arranged = layoutBoard(toBoard(ctx.document.toJSON()), name, true);
    arranged.nodes.forEach((n) => {
      ctx.operation.updateNodePosition(n.id, { x: n.x!, y: n.y! });
    });
    onTidy(arranged);
    fit(ctx);
  };

  return (
    <>
      <div className="tools">
        <button onClick={addNode}>Add node</button>
        <button onClick={tidy} disabled={count === 0}>
          Tidy
        </button>
        <i />
        <button aria-label="Undo" onClick={() => ctx.history.undo()} disabled={!history.undo}>
          ↶
        </button>
        <button aria-label="Redo" onClick={() => ctx.history.redo()} disabled={!history.redo}>
          ↷
        </button>
        <i />
        <button aria-label="Zoom out" onClick={() => tools.zoomout()}>
          −
        </button>
        <output>{Math.round(tools.zoom * 100)}%</output>
        <button aria-label="Zoom in" onClick={() => tools.zoomin()}>
          +
        </button>
        <button onClick={() => fit(ctx)} disabled={count === 0}>
          Fit
        </button>
      </div>
      {count > MINIMAP_THRESHOLD && (
        <div className="minimap">
          <MinimapRender
            containerStyles={{ position: 'relative', inset: 'unset', pointerEvents: 'auto' }}
            inactiveStyle={{ opacity: 1, scale: 1, translateX: 0, translateY: 0 }}
          />
        </div>
      )}
    </>
  );
}

type Props = {
  name: BoardName;
  board: Board;
  // Node ids to draw one at a time when the canvas opens.
  fresh: string[];
  onChange: (board: Board) => void;
  onProgress: (progress: { placed: number; total: number } | null) => void;
};

export function BoardCanvas({ name, board, fresh, onChange, onProgress }: Props) {
  const latest = useRef({ onChange, onProgress });
  latest.current = { onChange, onProgress };
  const building = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const editorProps = useMemo<FreeLayoutProps>(() => {
    const laidOut = layoutBoard(board, name);
    const incoming = new Set(reducedMotion() ? [] : fresh);
    const nodes = laidOut.nodes.filter((n) => !incoming.has(n.id));
    const edges = laidOut.edges.filter((e) => !incoming.has(e.source) && !incoming.has(e.target));
    const horizontal = isHorizontal(name);

    // Grows outward along the direction the board reads.
    const queue = laidOut.nodes
      .filter((n) => incoming.has(n.id))
      .sort((a, b) => (horizontal ? a.x! - b.x! : a.y! - b.y!));

    const build = (ctx: FreeLayoutPluginContext) => {
      building.current = true;
      ctx.playground.config.readonly = true;
      const present = new Set(nodes.map((n) => n.id));
      const total = queue.length;
      let placed = 0;

      const step = () => {
        const node = queue[placed];
        ctx.document.createWorkflowNode(toNodeJson(node));
        present.add(node.id);
        laidOut.edges
          .filter((e) => present.has(e.source) && present.has(e.target))
          .filter((e) => e.source === node.id || e.target === node.id)
          .forEach((e) =>
            ctx.document.linesManager.createLine({
              from: e.source,
              to: e.target,
              data: { label: e.label },
            }),
          );
        placed += 1;
        latest.current.onProgress({ placed, total });
        fit(ctx);

        if (placed < total) {
          timer.current = window.setTimeout(step, BUILD_STEP_MS);
          return;
        }
        building.current = false;
        ctx.playground.config.readonly = false;
        ctx.document.linesManager.forceUpdate();
        latest.current.onProgress(null);
        latest.current.onChange(toBoard(ctx.document.toJSON()));
      };
      step();
    };

    return {
      background: { backgroundColor: 'transparent', dotColor: '#2a4058', dotSize: 1, gridSize: 26, dotOpacity: 1 },
      initialData: { nodes: nodes.map(toNodeJson), edges: edges.map(toEdgeJson) },
      nodeRegistries: [
        {
          type: NODE_TYPE,
          meta: {
            size: { width: NODE_WIDTH, height: NODE_HEIGHT },
            defaultPorts: [
              { type: 'input', location: horizontal ? 'left' : 'top' },
              { type: 'output', location: horizontal ? 'right' : 'bottom' },
            ],
          },
          formMeta: { render: () => <CardBody /> },
        },
      ],
      nodeEngine: { enable: true },
      history: { enable: true, enableChangeNode: true },
      lineColor: {
        hidden: 'transparent',
        default: '#5b80a8',
        drawing: '#ff9a63',
        hovered: '#a9cbec',
        selected: '#ff9a63',
        error: '#ff5d5d',
        flowing: '#ff9a63',
      },
      materials: { renderDefaultNode: CardNode },
      plugins: () => [
        createFreeLinesPlugin({ renderInsideLine: LineLabel }),
        createFreeSnapPlugin({ edgeColor: '#ff9a63', alignColor: '#ff9a63' }),
        createMinimapPlugin({
          disableLayer: true,
          canvasStyle: {
            canvasWidth: 180,
            canvasHeight: 110,
            canvasBackground: 'rgba(16, 26, 39, 0.9)',
            canvasBorderRadius: 12,
            nodeColor: '#55708f',
            viewportBackground: 'rgba(255, 154, 99, 0.12)',
            viewportBorderColor: '#ff9a63',
            overlayColor: 'rgba(0, 0, 0, 0)',
          },
        }),
      ],
      canAddLine: (_ctx, from, to) => from.node !== to.node,
      isFlowingLine: () => building.current,
      shortcuts: (registry, ctx) => {
        registry.addHandlers({
          commandId: 'buildflow.delete',
          shortcuts: ['backspace', 'delete'],
          isEnabled: () => !ctx.playground.config.readonly,
          execute: () => ctx.selection.selection.forEach((entity) => entity.dispose()),
        });
      },
      onContentChange: (ctx) => {
        if (!building.current) latest.current.onChange(toBoard(ctx.document.toJSON()));
      },
      onAllLayersRendered: (ctx) => {
        fit(ctx, false);
        if (queue.length > 0) build(ctx);
      },
    };
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="canvas">
      <FreeLayoutEditorProvider {...editorProps}>
        <EditorRenderer className="editor" />
        <Tools name={name} onTidy={onChange} />
        <Inspector name={name} />
      </FreeLayoutEditorProvider>
    </div>
  );
}
