const MAP_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='520'><rect width='420' height='520' fill='#e8eee4'/><path d='M250 0h170v170H300q-50-60-50-170zM0 340h130l40 180H0z' fill='#c9e4bd'/><path d='M300 300q60-30 120-10v120q-80 20-130-40z' fill='#b7dcf0'/><g fill='none' stroke='#fff' stroke-linecap='round'><path stroke-width='16' d='M-10 120q170 60 440 10M90-10q40 260 10 540'/><path stroke-width='10' d='M-10 260h440M250-10q-20 280 30 540M-10 420q200-40 440 10'/><path stroke-width='6' d='M170-10v280M340 130v400M-10 190h260M90 340h330'/></g></svg>`;

const mapImage = `url("data:image/svg+xml,${encodeURIComponent(MAP_SVG)}")`;

// Built into every mockup, so a screen only needs a palette and content.
export const SCREEN_KIT = `
:root { --brand: #5b5bd6; --accent: #ff7a59; --bg: #f6f6fb; --surface: #fff; --ink: #1b1b2f; --muted: #6b6b80; --radius: 18px; --font: -apple-system, 'Segoe UI', Roboto, sans-serif; }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; overflow: hidden; }
body { display: flex; flex-direction: column; background: var(--bg); color: var(--ink); font: 15px/1.4 var(--font); -webkit-font-smoothing: antialiased; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 28px; line-height: 1.12; letter-spacing: -0.02em; }
h2 { font-size: 20px; letter-spacing: -0.01em; }
h3 { font-size: 15px; }
.muted { color: var(--muted); font-size: 13px; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; }
.hero { padding: 22px 20px; background: linear-gradient(145deg, var(--brand), color-mix(in srgb, var(--brand) 55%, var(--accent))); color: #fff; border-radius: 0 0 28px 28px; }
.hero .muted { color: #ffffffc9; }
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px 20px; overflow: hidden; }
.row { display: flex; align-items: center; gap: 12px; }
.grow { flex: 1; min-width: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.card { padding: 14px; background: var(--surface); border-radius: var(--radius); box-shadow: 0 6px 20px color-mix(in srgb, var(--ink) 9%, transparent); }
.chips { display: flex; gap: 8px; overflow: hidden; }
.chip { flex: none; padding: 6px 12px; background: var(--surface); border-radius: 99px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent); }
.chip.on { background: var(--brand); color: #fff; }
.badge { padding: 3px 8px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: color-mix(in srgb, var(--accent) 75%, var(--ink)); border-radius: 8px; font-size: 12px; font-weight: 700; }
.avatar { flex: none; display: grid; place-items: center; width: 42px; height: 42px; background: linear-gradient(135deg, var(--accent), var(--brand)); border-radius: 50%; color: #fff; font-weight: 700; }
.photo { flex: none; display: grid; place-items: center; width: 64px; height: 64px; background: linear-gradient(135deg, color-mix(in srgb, var(--brand) 22%, #fff), color-mix(in srgb, var(--accent) 35%, #fff)); border-radius: 14px; font-size: 30px; }
.photo.wide { width: 100%; height: 170px; font-size: 68px; }
.btn { display: block; width: 100%; padding: 14px; background: var(--brand); border: 0; border-radius: 14px; color: #fff; font: 700 15px var(--font); text-align: center; box-shadow: 0 8px 20px color-mix(in srgb, var(--brand) 35%, transparent); }
.btn.ghost { background: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand); box-shadow: none; }
.input { padding: 13px 14px; background: var(--surface); border-radius: 14px; color: var(--muted); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent); }
.map { position: relative; flex: 1; min-height: 200px; overflow: hidden; background: ${mapImage} center / cover; border-radius: var(--radius); }
.pin { position: absolute; padding: 5px 10px; background: var(--brand); border-radius: 99px 99px 99px 4px; color: #fff; font-size: 12px; font-weight: 700; box-shadow: 0 6px 14px #0004; }
.bubble { max-width: 78%; padding: 10px 14px; background: var(--surface); border-radius: 18px 18px 18px 5px; box-shadow: 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent); }
.bubble.me { align-self: flex-end; background: var(--brand); color: #fff; border-radius: 18px 18px 5px 18px; }
.stat { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
.progress { height: 8px; overflow: hidden; background: color-mix(in srgb, var(--brand) 14%, transparent); border-radius: 9px; }
.progress i { display: block; height: 100%; background: var(--brand); border-radius: 9px; }
.tabbar { display: flex; justify-content: space-around; padding: 10px 12px 16px; background: var(--surface); box-shadow: 0 -6px 20px color-mix(in srgb, var(--ink) 7%, transparent); font-size: 11px; color: var(--muted); text-align: center; }
.tabbar b { display: block; font-size: 20px; font-weight: 400; }
.tabbar .on { color: var(--brand); font-weight: 700; }
.shell { flex: 1; min-height: 0; display: flex; }
.side { flex: none; display: flex; flex-direction: column; gap: 6px; width: 230px; padding: 20px 14px; background: var(--surface); }
.side a { padding: 10px 12px; border-radius: 11px; color: var(--muted); font-weight: 600; }
.side a.on { background: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
`;

// Models override the kit however firmly they are told not to, which greys out
// maps and hides chips. Only a screen's palette, and the inline positions and
// widths the kit relies on, are kept.
export const keepPaletteOnly = (html: string) =>
  html
    .replace(/<style[^>]*>([\s\S]*?)(<\/style>|$)/gi, (_tag, css: string) => {
      const palette = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? '';
      return palette && `<style>${palette}</style>`;
    })
    .replace(/\sstyle="([^"]*)"/gi, (_attr, css: string) => {
      const kept = css.split(';').filter((rule) => /^\s*(left|top|width)\s*:/i.test(rule));
      return kept.length > 0 ? ` style="${kept.join(';')}"` : '';
    });

// What the model is told it can use.
export const SCREEN_KIT_GUIDE = `Every screen already includes a design kit. Use only these classes. The only <style> you may write is the one-line palette, and never define your own classes.
Layout: .bar (top row), .hero (branded header), .body (scrolling content, flex column), .row, .grow, .grid, .tabbar (mobile bottom nav: <div class="on"><b>🏠</b>Home</div>), .shell > .side (desktop sidebar: <a class="on">) + .main.
Content: .card, .chips > .chip(.on), .badge, .avatar, .photo(.wide, holds one large emoji), .btn(.ghost), .input, .muted, .stat, .progress > i (style="width:60%"), .bubble(.me), .map > .pin (style="left:40%;top:30%"; the map draws streets itself).
Start each screen with a palette for this product: <style>:root{--brand:#..;--accent:#..;--bg:#..;--surface:#..;--ink:#..;--muted:#..;--radius:..px}</style>
Choose a distinctive palette that suits the product, dark or light. Mobile screens end with .tabbar. .stat is only for short numbers such as 4.8. .hero holds a title and short text, never cards. Inline style is allowed only for left, top and width.`;
