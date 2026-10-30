import type { ProjectSummary } from '../../shared/plan';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
];

const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function ago(date: string) {
  const elapsed = Date.now() - new Date(date).getTime();
  const [unit, size] = UNITS.find(([, ms]) => elapsed >= ms) ?? ['minute', 60000];
  return format.format(-Math.floor(elapsed / size), unit);
}

type Props = { projects: ProjectSummary[]; onOpen: (id: string) => void };

export function RecentProjects({ projects, onOpen }: Props) {
  return (
    <section className="recent">
      <h2>Your projects</h2>
      <div>
        {projects.map((p) => (
          <button key={p.id} onClick={() => onOpen(p.id)}>
            <strong>{p.name}</strong>
            <span>Updated {ago(p.updatedAt)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
