import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  EditorRenderer,
  Field,
  FreeLayoutEditorProvider,
  WorkflowNodeRenderer,
  WorkflowSelectService,
  getNodeForm,
  useClientContext,
  useNodeRender,
  usePlaygroundTools,
  useService,
  type FreeLayoutPluginContext,
  type FreeLayoutProps,
  type WorkflowLineEntity,
  type WorkflowNodeEntity,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor';
import { createFreeLinesPlugin } from '@flowgram.ai/free-lines-plugin';
import { createFreeSnapPlugin } from '@flowgram.ai/free-snap-plugin';
import { MinimapRender, createMinimapPlugin } from '@flowgram.ai/minimap-plugin';
import type { Board, BoardName, NodeDetails } from '../../shared/plan';
import { api } from './api';
import { KindIcon } from './KindIcon';
import { NODE_HEIGHT, NODE_WIDTH, isHorizontal, layoutBoard } from './layout';
import {
  NODE_TYPE,
  createLiveBuild,
  fit,
  reducedMotion,
  toBoard,
  toEdgeJson,
  toNodeJson,
  type LiveBoard,
} from './liveBuild';

const KINDS: Record<BoardName, string[]> = {
  system: ['client', 'service', 'database', 'external', 'queue'],
  features: ['epic', 'feature', 'task'],
  roadmap: ['phase', 'milestone'],
};

// Small boards fit on screen, where the minimap would only cover nodes.
const MINIMAP_THRESHOLD = 12;

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

// Details are written the first time a node is opened and kept with it. The
// short delay stops a card that is only being dragged past from spending tokens.
const DETAILS_DELAY_MS = 600;

type DetailsProps = {
  name: BoardName;
  node: WorkflowNodeEntity;
  projectId: string;
  details: NodeDetails | undefined;
  onFlush: () => Promise<void>;
  onLoaded: (details: NodeDetails) => void;
};

function Details({ name, node, projectId, details, onFlush, onLoaded }: DetailsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await onFlush();
      const written = await api.details(projectId, name, node.id);
      if (!node.disposed) onLoaded(written);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (details) return;
    const timer = window.setTimeout(load, DETAILS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="details">
      {details && (
        <>
          <p className="details-summary">{details.summary}</p>
          {details.sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {loading && <p className="details-status">Working out the details…</p>}
      {error && <p className="details-status failed">{error}</p>}
      {!loading && (details || error) && (
        <button onClick={load}>{details ? 'Rewrite with my latest answers' : 'Try again'}</button>
      )}
    </div>
  );
}

type InspectorProps = {
  name: BoardName;
  projectId: string;
  onFlush: () => Promise<void>;
  onExtend: (nodeId: string, label: string) => void;
};

function Inspector({ name, projectId, onFlush, onExtend }: InspectorProps) {
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

  const set = (path: string, value: unknown) => {
    form.setValueIn(path, value);
    redraw((n) => n + 1);
  };
  const kind: string = form.getValueIn('kind');

  return (
    <aside className="inspector" key={node.id}>
      <header className={`kind-${kind}`}>
        <KindIcon kind={kind} />
        <span>{kind}</span>
      </header>
      <h3>{form.getValueIn('label')}</h3>
      {form.getValueIn('description') && <p className="muted">{form.getValueIn('description')}</p>}
      <button className="primary" onClick={() => onExtend(node.id, form.getValueIn('label'))}>
        Build on this
      </button>

      <Details
        key={node.id}
        name={name}
        node={node}
        projectId={projectId}
        details={form.getValueIn('details')}
        onFlush={onFlush}
        onLoaded={(details) => set('details', details)}
      />

      <details className="edit-node">
        <summary>Edit this node</summary>
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
            rows={3}
            value={form.getValueIn('description')}
            onChange={(e) => set('description', e.target.value)}
          />
        </label>
        <button className="danger" onClick={() => node.dispose()}>
          Delete node
        </button>
      </details>
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
            panelStyles={{ padding: 0, background: 'none', border: 0, boxShadow: 'none' }}
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
  projectId: string;
  // Writes pending edits, so the server sees the node a request refers to.
  onFlush: () => Promise<void>;
  onExtend: (nodeId: string, label: string) => void;
  // Node ids to draw one at a time when the canvas opens.
  fresh: string[];
  // Filled while the canvas is open, for feeding it a plan as it is generated.
  live: RefObject<LiveBoard | null>;
  onChange: (board: Board) => void;
  onProgress: (placed: number | null) => void;
};

export function BoardCanvas({
  name,
  board,
  projectId,
  onFlush,
  onExtend,
  fresh,
  live,
  onChange,
  onProgress,
}: Props) {
  const latest = useRef({ onChange, onProgress });
  latest.current = { onChange, onProgress };
  const building = useRef(false);
  const stopBuild = useRef<(() => void) | null>(null);

  const editorProps = useMemo<FreeLayoutProps>(() => {
    const laidOut = layoutBoard(board, name);
    const incoming = new Set(reducedMotion() ? [] : fresh);
    const nodes = laidOut.nodes.filter((n) => !incoming.has(n.id));
    const edges = laidOut.edges.filter((e) => !incoming.has(e.source) && !incoming.has(e.target));
    const horizontal = isHorizontal(name);

    const open = (ctx: FreeLayoutPluginContext) => {
      const build = createLiveBuild(ctx, name, { nodes, edges }, {
        onStart: () => {
          building.current = true;
        },
        onProgress: (placed) => latest.current.onProgress(placed),
        onDone: (result) => {
          building.current = false;
          latest.current.onProgress(null);
          latest.current.onChange(result);
        },
      });
      live.current = build;
      stopBuild.current = build.dispose;
      if (incoming.size > 0) {
        laidOut.nodes.filter((n) => incoming.has(n.id)).forEach((node) => build.add({ node }));
        laidOut.edges
          .filter((e) => incoming.has(e.source) || incoming.has(e.target))
          .forEach((edge) => build.add({ edge }));
        build.finish(laidOut);
      }
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
        open(ctx);
        // Saved lines are drawn before the cards are measured, which stacks them
        // at the origin until they are recalculated.
        requestAnimationFrame(() => {
          ctx.document.getAllNodes().forEach((node) => node.ports.updateAllPorts());
          ctx.document.linesManager.forceUpdate();
        });
      },
    };
  }, []);

  useEffect(
    () => () => {
      stopBuild.current?.();
      live.current = null;
    },
    [live],
  );

  return (
    <div className="canvas">
      <FreeLayoutEditorProvider {...editorProps}>
        <EditorRenderer className="editor" />
        <Tools name={name} onTidy={onChange} />
        <Inspector name={name} projectId={projectId} onFlush={onFlush} onExtend={onExtend} />
      </FreeLayoutEditorProvider>
    </div>
  );
}
