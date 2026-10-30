import type { Board, Plan } from './plan';

const BOARDS: { name: keyof Plan['boards']; title: string }[] = [
  { name: 'system', title: 'System design' },
  { name: 'features', title: 'Features' },
  { name: 'roadmap', title: 'Roadmap' },
];

function boardMarkdown(board: Board) {
  const labels = new Map(board.nodes.map((n) => [n.id, n.label]));
  const lines: string[] = [];

  for (const node of board.nodes) {
    lines.push(`### ${node.label} (${node.kind})`);
    if (node.description) lines.push('', node.description);
    const next = board.edges.filter((e) => e.source === node.id);
    if (next.length > 0) {
      lines.push('', 'Leads to:');
      for (const e of next) lines.push(`- ${labels.get(e.target)}${e.label ? ` (${e.label})` : ''}`);
    }
    if (node.details) {
      lines.push('', node.details.summary);
      for (const section of node.details.sections) {
        lines.push('', `**${section.title}**`, ...section.items.map((item) => `- ${item}`));
      }
    }
    lines.push('');
  }
  return lines;
}

export function planMarkdown(name: string, plan: Plan) {
  const decisions = (plan.questions ?? []).filter((q) => q.answer);
  const lines = [`# ${name}`, '', '## Requirements', ''];
  lines.push(...plan.requirements.map((r) => `- [${r.type}] ${r.text}`), '');

  if (decisions.length > 0) {
    lines.push('## Decisions', '', ...decisions.map((q) => `- ${q.text} ${q.answer}`), '');
  }
  for (const { name: board, title } of BOARDS) {
    if (plan.boards[board].nodes.length > 0) lines.push(`## ${title}`, '', ...boardMarkdown(plan.boards[board]));
  }
  return lines.join('\n').trimEnd() + '\n';
}

export const buildPrompt = (name: string, plan: Plan) =>
  `You are building "${name}". Follow this plan. Respect every decision, work through the roadmap in order, and ask me before changing the architecture.

${planMarkdown(name, plan)}`;
