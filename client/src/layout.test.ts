import { describe, expect, it } from 'vitest';
import type { Board } from '../../shared/plan';
import { layoutBoard } from './layout';

const chain = (length: number): Board => ({
  nodes: Array.from({ length }, (_, i) => ({ id: `n${i}`, label: `N${i}`, description: '', kind: 'phase' })),
  edges: Array.from({ length: length - 1 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}` })),
});

describe('roadmap layout', () => {
  it('keeps a short roadmap on one row', () => {
    const { nodes } = layoutBoard(chain(5), 'roadmap', true);
    expect(new Set(nodes.map((n) => n.y)).size).toBe(1);
  });

  it('wraps a long roadmap into rows without stacking cards', () => {
    const { nodes } = layoutBoard(chain(12), 'roadmap', true);
    expect(new Set(nodes.map((n) => n.x)).size).toBe(5);
    expect(new Set(nodes.map((n) => n.y)).size).toBe(3);
    expect(new Set(nodes.map((n) => `${n.x},${n.y}`)).size).toBe(12);
  });
});
