import dagre from '@dagrejs/dagre';
import type { Board, BoardName } from '../../shared/plan';

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 84;

export const isHorizontal = (name: BoardName) => name !== 'features';

// With force set every node is repositioned; otherwise only nodes that have
// never been placed move, so a generation leaves the user's arrangement alone.
export function layoutBoard(board: Board, name: BoardName, force = false): Board {
  if (!force && board.nodes.every((n) => n.x !== undefined && n.y !== undefined)) return board;

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: isHorizontal(name) ? 'LR' : 'TB', nodesep: 44, ranksep: 110 });
  graph.setDefaultEdgeLabel(() => ({}));
  board.nodes.forEach((n) => graph.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  board.edges.forEach((e) => graph.setEdge(e.source, e.target));
  dagre.layout(graph);

  return {
    ...board,
    nodes: board.nodes.map((node) => {
      if (!force && node.x !== undefined && node.y !== undefined) return node;
      const { x, y } = graph.node(node.id);
      return { ...node, x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 };
    }),
  };
}
