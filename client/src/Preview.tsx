import { memo, useEffect, useRef, useState } from 'react';
import { parseScreens, type Project, type Screen } from '../../shared/plan';
import { SCREEN_KIT, keepPaletteOnly } from '../../shared/screenKit';
import { api } from './api';

// Reloading an iframe on every delta would flicker.
const DRAW_INTERVAL_MS = 450;

const SIZES = {
  mobile: { width: 390, height: 780, scale: 0.8 },
  desktop: { width: 1280, height: 800, scale: 0.5 },
};

// Screens are model-written HTML, so nothing in them may run or reach the
// network: the empty sandbox stops scripts and the policy stops requests.
const POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;

const ScreenFrame = memo(function ScreenFrame({ name, device, html }: Screen) {
  const { width, height, scale } = SIZES[device];
  return (
    <figure className={`screen ${device}`} style={{ margin: 0 }}>
      <figcaption>{name}</figcaption>
      <div className="screen-frame" style={{ width: width * scale, height: height * scale }}>
        <iframe
          title={name}
          sandbox=""
          srcDoc={`<!doctype html>${POLICY}<style>${SCREEN_KIT}</style>${keepPaletteOnly(html)}`}
          style={{ width, height, transform: `scale(${scale})` }}
        />
      </div>
    </figure>
  );
});

type Props = {
  project: Project;
  onDrafting: (drafting: boolean) => void;
  onUpdated: (project: Project) => void;
  onError: (message: string | null) => void;
};

export function Preview({ project, onDrafting, onUpdated, onError }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const lastDraw = useRef(0);
  const screens = parseScreens(draft ?? project.plan.preview ?? '');
  const hasPlan = project.plan.requirements.length > 0;

  useEffect(() => () => onDrafting(false), [onDrafting]);

  const design = async () => {
    onError(null);
    onDrafting(true);
    setDraft('');
    let text = '';
    try {
      const updated = await api.preview(project.id, (event) => {
        text += event.text;
        if (Date.now() - lastDraw.current < DRAW_INTERVAL_MS) return;
        lastDraw.current = Date.now();
        setDraft(text);
      });
      onUpdated(updated);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setDraft(null);
      onDrafting(false);
    }
  };

  const drafting = draft !== null;

  if (screens.length === 0) {
    return (
      <div className="preview">
        <div className="preview-empty">
          <h2>See how it could look.</h2>
          <p>
            {hasPlan
              ? 'Turn this plan into mockups of its most important screens.'
              : 'Build a plan first, then turn it into mockups of its most important screens.'}
          </p>
          <button className="primary" onClick={design} disabled={!hasPlan || drafting}>
            {drafting ? 'Designing…' : 'Design the screens'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="preview">
      <div className="preview-bar">
        <div>
          <h2>How it could look</h2>
          Concept mockups from your plan. They aren't a working app.
        </div>
        <button onClick={design} disabled={drafting}>
          {drafting ? 'Designing…' : 'Try another design'}
        </button>
      </div>
      <div className="screens">
        {screens.map((screen) => (
          <ScreenFrame key={screen.name} {...screen} />
        ))}
      </div>
    </div>
  );
}
