import dagre from '@dagrejs/dagre';
import type { Board, BoardName } from '../../shared/plan';

export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 104;

const GROUP_GAP = 120;
const ROADMAP_COLUMNS = 5;
const ROADMAP_ROW_GAP = 90;

export const isHorizontal = (name: BoardName) => name !== 'features';

const placed = (n: Board['nodes'][number]) => n.x !== undefined && n.y !== undefined;

const bounds = (nodes: Board['nodes']) => ({
  left: Math.min(...nodes.map((n) => n.x!)),
  top: Math.min(...nodes.map((n) => n.y!)),
  right: Math.max(...nodes.map((n) => n.x! + NODE_WIDTH)),
  bottom: Math.max(...nodes.map((n) => n.y! + NODE_HEIGHT)),
});

// A long roadmap would otherwise shrink to one unreadable line, so it wraps into
// rows that read left to right.
function wrapRoadmap<T extends { x: number; y: number }>(nodes: T[]) {
  const columns = [...new Set(nodes.map((n) => n.x))].sort((a, b) => a - b);
  if (columns.length <= ROADMAP_COLUMNS) return nodes;
  const height = Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y)) + NODE_HEIGHT;
  return nodes.map((n) => {
    const column = columns.indexOf(n.x);
    const row = Math.floor(column / ROADMAP_COLUMNS);
    return {
      ...n,
      x: columns[column % ROADMAP_COLUMNS],
      y: n.y + row * (height + ROADMAP_ROW_GAP),
    };
  });
}

// With force set every node is repositioned; otherwise only nodes that have
// never been placed move, so a generation leaves the user's arrangement alone.
export function layoutBoard(board: Board, name: BoardName, force = false, anchorId?: string): Board {
  if (!force && board.nodes.every(placed)) return board;

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: isHorizontal(name) ? 'LR' : 'TB',
    nodesep: 56,
    ranksep: name === 'roadmap' ? 80 : 130,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  board.nodes.forEach((n) => graph.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  board.edges.forEach((e) => graph.setEdge(e.source, e.target));
  dagre.layout(graph);

  const keep = force ? [] : board.nodes.filter(placed);
  const positioned = board.nodes
    .filter((n) => !keep.includes(n))
    .map((n) => {
      const { x, y } = graph.node(n.id);
      return { ...n, x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 };
    });
  const added = name === 'roadmap' ? wrapRoadmap(positioned) : positioned;

  // New nodes arrive as one group beside the existing arrangement, which can
  // have been moved anywhere by hand.
  if (keep.length > 0) {
    const old = bounds(keep);
    const fresh = bounds(added);
    const anchor = keep.find((n) => n.id === anchorId);
    // Work on one node sits just below the board, lined up with that node.
    const [dx, dy] = anchor
      ? [
          anchor.x! - (fresh.left + fresh.right) / 2 + (isHorizontal(name) ? NODE_WIDTH : 0),
          old.bottom + GROUP_GAP - fresh.top,
        ]
      : isHorizontal(name)
        ? [old.left - fresh.left, old.bottom + GROUP_GAP - fresh.top]
        : [old.right + GROUP_GAP - fresh.left, old.top - fresh.top];
    added.forEach((n) => {
      n.x += dx;
      n.y += dy;
    });
  }

  const positions = new Map([...keep, ...added].map((n) => [n.id, n]));
  return { ...board, nodes: board.nodes.map((n) => positions.get(n.id)!) };
}
