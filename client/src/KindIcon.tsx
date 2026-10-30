const PATHS: Record<string, string> = {
  client: 'M3 4h18v12H3zM8 20h8M12 16v4',
  service: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  database: 'M4 6c0-4 16-4 16 0v12c0 4-16 4-16 0zM4 6c0 4 16 4 16 0M4 12c0 4 16 4 16 0',
  external: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM3 12h18M12 3c5 6 5 12 0 18M12 3c-5 6-5 12 0 18',
  queue: 'M3 7h13M3 12h13M3 17h13M18 7l3 5-3 5',
  epic: 'M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.6 3.1 1.2-6.3L3 9.6l6.3-.8z',
  feature: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  task: 'M4 12l5 5L20 6',
  phase: 'M4 4v16M4 5h13l-3 4 3 4H4',
  milestone: 'M12 3l9 9-9 9-9-9z',
};

const FALLBACK = 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z';

export function KindIcon({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[kind] ?? FALLBACK} />
    </svg>
  );
}
