import type { BoardName } from '../../shared/plan';

export type ScannedItem = { board: BoardName; list: 'nodes' | 'edges'; value: unknown };

// Pulls each finished node and edge out of a {"system": {"nodes": [...], ...}, ...}
// reply while it is still arriving. It only reports complete objects, so it never
// has to guess at a half-written one. Depth 4 is an item: root, board, array, object.
export function createBoardScanner(onItem: (item: ScannedItem) => void) {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let token = '';
  let board = '';
  let list = '';
  let item = '';

  const readChar = (char: string) => {
    if (item) item += char;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') {
        inString = false;
        if (open.length === 1) board = token;
        if (open.length === 2) list = token;
      } else token += char;
      return;
    }

    if (char === '"') {
      inString = true;
      token = '';
    } else if (char === '{' || char === '[') {
      open.push(char);
      if (open.length === 4 && char === '{') item = char;
    } else if (char === '}' || char === ']') {
      if (open.length === 4 && item) {
        try {
          onItem({ board: board as BoardName, list: list as ScannedItem['list'], value: JSON.parse(item) });
        } catch {
          // The final validation decides what happens to a malformed item.
        }
        item = '';
      }
      open.pop();
    }
  };

  return (delta: string) => {
    for (const char of delta) readChar(char);
  };
}
