import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        sunken: 'var(--sunken)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-wash': 'var(--accent-wash)',
        good: 'var(--good)',
        'good-wash': 'var(--good-wash)',
        warn: 'var(--warn)',
        'warn-wash': 'var(--warn-wash)',
        bad: 'var(--bad)',
        'bad-wash': 'var(--bad-wash)',
        info: 'var(--info)',
        'info-wash': 'var(--info-wash)',
        rail: 'var(--rail)',
        'rail-ink': 'var(--rail-ink)',
        'rail-active': 'var(--rail-active)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '3px', sm: '2px', md: '4px' },
      fontSize: { '2xs': ['11px', '14px'] },
    },
  },
  plugins: [],
};
export default config;
