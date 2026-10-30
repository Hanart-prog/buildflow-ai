import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import type { Board, BoardName } from '../../shared/plan';
import { isHorizontal, layoutBoard } from './layout';

type CardData = { label: string; description: string; kind: string; horizontal: boolean };
type Card = Node<CardData, 'card'>;

const KINDS: Record<BoardName, string[]> = {
  system: ['client', 'service', 'database', 'external', 'queue'],
  features: ['epic', 'feature', 'task'],
  roadmap: ['phase', 'milestone'],
};

const NodeCard = memo(function NodeCard({ data, selected }: NodeProps<Card>) {
  const [target, source] = data.horizontal
    ? [Position.Left, Position.Right]
    : [Position.Top, Position.Bottom];
  return (
    <div className={`card kind-${data.kind}${selected ? ' selected' : ''}`}>
      <Handle type="target" position={target} />
      <span className="card-kind">{data.kind}</span>
      <strong>{data.label}</strong>
      {data.description && <p>{data.description}</p>}
      <Handle type="source" position={source} />
    </div>
  );
});

const nodeTypes = { card: NodeCard };

// Small boards fit on screen, where the minimap would only cover nodes.
const MINIMAP_THRESHOLD = 30;

const edgeDefaults = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#6b7488' },
};

const toCards = (board: Board, name: BoardName): Card[] =>
  board.nodes.map((n) => ({
    id: n.id,
    type: 'card',
    position: { x: n.x ?? 0, y: n.y ?? 0 },
    data: {
      label: n.label,
      description: n.description,
      kind: n.kind,
      horizontal: isHorizontal(name),
    },
  }));

const toEdges = (board: Board): Edge[] => board.edges.map((e) => ({ ...e, ...edgeDefaults }));

const toBoard = (nodes: Card[], edges: Edge[]): Board => {
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      description: n.data.description,
      kind: n.data.kind,
      x: n.position.x,
      y: n.position.y,
    })),
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
  };
};

type Props = { name: BoardName; board: Board; onChange: (board: Board) => void };

function Canvas({ name, board, onChange }: Props) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const initial = useMemo(() => layoutBoard(board, name), [board, name]);
  const [nodes, setNodes] = useState(() => toCards(initial, name));
  const [edges, setEdges] = useState(() => toEdges(initial));

  // Refs hold the latest graph because node and edge removals arrive as
  // separate callbacks in the same tick.
  const latest = useRef({ nodes, edges });

  const update = (nextNodes: Card[], nextEdges: Edge[], persist = true) => {
    latest.current = { nodes: nextNodes, edges: nextEdges };
    setNodes(nextNodes);
    setEdges(nextEdges);
    if (persist) onChange(toBoard(nextNodes, nextEdges));
  };

  const onNodesChange = (changes: NodeChange<Card>[]) => {
    const next = applyNodeChanges(changes, latest.current.nodes);
    update(next, latest.current.edges, changes.some((c) => c.type === 'remove'));
  };

  const onEdgesChange = (changes: EdgeChange<Edge>[]) => {
    const next = applyEdgeChanges(changes, latest.current.edges);
    update(latest.current.nodes, next, changes.some((c) => c.type === 'remove'));
  };

  const onConnect = (connection: Connection) => {
    const id = `${connection.source}->${connection.target}`;
    update(latest.current.nodes, addEdge({ ...connection, id, ...edgeDefaults }, latest.current.edges));
  };

  const addCard = () => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const card: Card = {
      id: crypto.randomUUID(),
      type: 'card',
      position,
      selected: true,
      data: {
        label: 'New node',
        description: '',
        kind: KINDS[name][0],
        horizontal: isHorizontal(name),
      },
    };
    const others = latest.current.nodes.map((n) => ({ ...n, selected: false }));
    update([...others, card], latest.current.edges);
  };

  const tidy = useCallback(() => {
    const arranged = layoutBoard(toBoard(latest.current.nodes, latest.current.edges), name, true);
    update(toCards(arranged, name), latest.current.edges);
    requestAnimationFrame(() => fitView({ duration: 250, padding: 0.15 }));
  }, [name, fitView]);

  const selected = nodes.find((n) => n.selected);

  const editSelected = (patch: Partial<CardData>) => {
    if (!selected) return;
    update(
      latest.current.nodes.map((n) =>
        n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
      latest.current.edges,
    );
  };

  const removeSelected = () => {
    if (!selected) return;
    update(
      latest.current.nodes.filter((n) => n.id !== selected.id),
      latest.current.edges.filter((e) => e.source !== selected.id && e.target !== selected.id),
    );
  };

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={() => onChange(toBoard(latest.current.nodes, latest.current.edges))}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.15}
      >
        <Background gap={24} size={1.5} />
        <Controls showInteractive={false} />
        {nodes.length > MINIMAP_THRESHOLD && <MiniMap pannable zoomable nodeStrokeWidth={3} />}
      </ReactFlow>

      <div className="canvas-actions">
        <button onClick={addCard}>Add node</button>
        <button onClick={tidy} disabled={nodes.length === 0}>
          Tidy layout
        </button>
      </div>

      {nodes.length === 0 && (
        <div className="canvas-empty">
          <h2>Nothing mapped yet</h2>
          <p>Talk through your idea on the left, or add a node by hand.</p>
        </div>
      )}

      {selected && (
        <aside className="inspector" key={selected.id}>
          <label>
            Label
            <input
              value={selected.data.label}
              onChange={(e) => editSelected({ label: e.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={selected.data.kind}
              onChange={(e) => editSelected({ kind: e.target.value })}
            >
              {[...new Set([...KINDS[name], selected.data.kind])].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea
              rows={4}
              value={selected.data.description}
              onChange={(e) => editSelected({ description: e.target.value })}
            />
          </label>
          <button className="danger" onClick={removeSelected}>
            Delete node
          </button>
        </aside>
      )}
    </div>
  );
}

export function BoardCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
