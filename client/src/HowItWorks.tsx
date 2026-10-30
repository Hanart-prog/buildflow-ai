import { useEffect, useRef, useState } from 'react';
import { KindIcon } from './KindIcon';

const TICK_MS = 750;
const STILL = Number.MAX_SAFE_INTEGER;

// One clock for every demo, stopped while the section is off screen. Reduced
// motion gets the last step of each demo, so the cards are still and complete.
function useTick() {
  const section = useRef<HTMLElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTick(STILL);
      return;
    }
    let timer: number | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      window.clearInterval(timer);
      if (entry.isIntersecting) timer = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    });
    observer.observe(section.current!);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return { section, tick };
}

const step = (tick: number, steps: number) => (tick === STILL ? steps - 1 : tick % steps);

function Mini({ kind, label, on, at, picked }: {
  kind: string;
  label: string;
  on: boolean;
  at: [number, number];
  picked?: boolean;
}) {
  return (
    <div
      className={`mini kind-${kind}${on ? ' on' : ''}${picked ? ' picked' : ''}`}
      style={{ left: `${at[0]}%`, top: `${at[1]}%` }}
    >
      <span>
        <KindIcon kind={kind} />
        {kind}
      </span>
      <strong>{label}</strong>
    </div>
  );
}

function Line({ d, on }: { d: string; on: boolean }) {
  return <path className={on ? 'on' : ''} d={d} pathLength={1} />;
}

const WORDS = ['A recipe app', 'where people post', 'and search', 'by ingredient'];
const HEARD = [
  ['feature', 'Post recipes'],
  ['feature', 'Search by ingredient'],
  ['open question', 'Who can post?'],
];

function SayIt({ tick }: { tick: number }) {
  const s = step(tick, 11);
  return (
    <div className="demo-say">
      <div className="demo-composer">
        <i className={s < 5 ? 'live' : ''}>
          <svg viewBox="0 0 24 24">
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4" />
          </svg>
        </i>
        <p>{WORDS.slice(0, s).join(' ') || 'Listening…'}</p>
      </div>
      <ul>
        {HEARD.map(([type, text], i) => (
          <li key={text} className={s >= 5 + i ? 'on' : ''}>
            <span>{type}</span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WatchItBuild({ tick }: { tick: number }) {
  const s = step(tick, 10);
  return (
    <div className="demo-board">
      <svg viewBox="0 0 340 220" aria-hidden="true">
        <Line d="M170 36V108" on={s >= 2} />
        <Line d="M170 108H66V184" on={s >= 4} />
        <Line d="M170 108V184" on={s >= 5} />
        <Line d="M170 108H274V184" on={s >= 6} />
      </svg>
      <Mini kind="client" label="Web app" on={s >= 1} at={[50, 16]} />
      <Mini kind="service" label="Recipe API" on={s >= 2} at={[50, 49]} />
      <Mini kind="database" label="Recipes" on={s >= 4} at={[19.5, 84]} />
      <Mini kind="queue" label="Indexer" on={s >= 5} at={[50, 84]} />
      <Mini kind="external" label="Image host" on={s >= 6} at={[80.5, 84]} />
    </div>
  );
}

function GoDeeper({ tick }: { tick: number }) {
  const s = step(tick, 10);
  return (
    <div className="demo-deeper">
      <div className="demo-panel">
        <small>A few questions</small>
        <p>Who can post recipes?</p>
        <div>
          <span>Anyone</span>
          <span className={s >= 2 ? 'chosen' : ''}>Signed-in users</span>
        </div>
      </div>
      <div className={`demo-panel demo-spec${s >= 4 ? ' on' : ''}`}>
        <small>Recipe API</small>
        <h4>Endpoints</h4>
        <ul>
          <li className={s >= 5 ? 'on' : ''}>POST /recipes</li>
          <li className={s >= 6 ? 'on' : ''}>GET /search</li>
        </ul>
        <h4>Rules</h4>
        <ul>
          <li className={s >= 7 ? 'on' : ''}>Sign-in required to post</li>
        </ul>
      </div>
    </div>
  );
}

function BuildOnIt({ tick }: { tick: number }) {
  const s = step(tick, 10);
  return (
    <div className="demo-board">
      <svg viewBox="0 0 340 220" aria-hidden="true">
        <Line d="M90 110H180V52H250" on={s >= 3} />
        <Line d="M90 110H180V168H250" on={s >= 5} />
      </svg>
      <Mini kind="service" label="Recipe API" on at={[26.5, 50]} picked={s >= 1} />
      <Mini kind="feature" label="Meal plans" on={s >= 3} at={[73.5, 24]} />
      <Mini kind="feature" label="Shopping list" on={s >= 5} at={[73.5, 76]} />
      <div className={`demo-build-on${s >= 1 && s < 3 ? ' on' : ''}`}>Build on this</div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Say it',
    text: 'Talk or type the idea. BuildFlow pulls out what you asked for and what is still undecided.',
    wash: 'wash-a',
    Demo: SayIt,
  },
  {
    title: 'Watch it build',
    text: 'The system, features and roadmap draw themselves on a canvas you can rearrange.',
    wash: 'wash-b',
    Demo: WatchItBuild,
  },
  {
    title: 'Go deeper',
    text: 'Answer a few questions about your idea, then open any card to read its detailed spec.',
    wash: 'wash-c',
    Demo: GoDeeper,
  },
  {
    title: 'Build on any card',
    text: 'Pick a card and describe what comes next. The new work grows straight out of it.',
    wash: 'wash-d',
    Demo: BuildOnIt,
  },
];

export function HowItWorks() {
  const { section, tick } = useTick();
  return (
    <section className="how" ref={section}>
      <h2>How BuildFlow works</h2>
      <div className="how-grid">
        {STEPS.map(({ title, text, wash, Demo }, i) => (
          <article key={title}>
            <header>
              <span>{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </header>
            <div className={`how-demo ${wash}`} aria-hidden="true">
              <Demo tick={tick} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
