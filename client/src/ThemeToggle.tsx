import type { Theme } from './theme';

type Props = { theme: Theme; onToggle: () => void; disabled?: boolean };

export function ThemeToggle({ theme, onToggle, disabled }: Props) {
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button className="theme-toggle" aria-label={label} title={label} onClick={onToggle} disabled={disabled}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d={
            theme === 'dark'
              ? 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'
              : 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'
          }
        />
      </svg>
    </button>
  );
}
