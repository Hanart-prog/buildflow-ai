import { useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'buildflow-theme';
const META = { light: '#f6f3f1', dark: '#171513' };

const CANVAS = {
  light: {
    canvas: '#f6f3f1',
    dots: '#d8d3d0',
    line: '#a9a4a1',
    lineHover: '#4e4d4d',
    lineActive: '#242424',
    error: '#c8321f',
    portOn: '#242424',
    portOff: '#cecac8',
    portBackground: '#fbf9f8',
    map: '#ece8e5',
    mapNode: '#a9a4a1',
    mapView: 'rgba(36, 36, 36, 0.07)',
    mapBorder: '#242424',
  },
  dark: {
    canvas: '#171513',
    dots: '#35312e',
    line: '#6e6965',
    lineHover: '#c9c4c0',
    lineActive: '#f6f3f1',
    error: '#ff8a73',
    portOn: '#f6f3f1',
    portOff: '#524d49',
    portBackground: '#211e1c',
    map: '#211e1c',
    mapNode: '#6e6965',
    mapView: 'rgba(246, 243, 241, 0.08)',
    mapBorder: '#f6f3f1',
  },
};

const stored = () => {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
};

const systemTheme = (): Theme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[theme]);
}

// Runs before the first render, so a dark page never flashes light.
export const initTheme = () => apply(stored() ?? systemTheme());

export const currentTheme = () => document.documentElement.dataset.theme as Theme;

// FlowGram takes these as plain values, so the canvas is rebuilt on a change.
export const canvasColors = () => CANVAS[currentTheme()];

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    apply(next);
    setTheme(next);
  };
  return { theme, toggle };
}
