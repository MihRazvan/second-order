'use client';
import type { ReactNode } from 'react';

/** Double-ruled BIOS panel. The title sits on the rule like a setup-utility box. */
export function Panel({ title, children, className = '', right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`bios-box relative bg-bios ${className}`}>
      {(title || right) && (
        <header className="flex items-baseline justify-between gap-4 px-3 pt-1">
          {title && <h2 className="bios-title text-[22px] leading-none">{title}</h2>}
          {right && <div className="text-bios-fg">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = 'green' | 'yellow' | 'red' | 'cyan' | 'white' | 'dim' | 'fg';
export const toneClass: Record<Tone, string> = {
  green: 'text-bios-green',
  yellow: 'text-bios-yellow',
  red: 'text-bios-red',
  cyan: 'text-bios-cyan',
  white: 'text-bios-white',
  dim: 'text-bios-dim',
  fg: 'text-bios-fg',
};

export function toneForEv(evPct: number): Tone {
  if (evPct >= 2) return 'green';
  if (evPct >= -2) return 'yellow';
  return 'red';
}
export function toneForLevel(value: number, start: number): Tone {
  if (start <= 0) return 'dim';
  if (value > start * 0.5) return 'green';
  if (value > start * 0.1) return 'yellow';
  return 'red';
}

/** A block bar made of █ and ░ glyphs, the way a BIOS draws a progress meter. */
export function Bar({ filled, total, tone, label }: { filled: number; total: number; tone: Tone; label: string }) {
  const f = Math.max(0, Math.min(total, Math.round(filled)));
  return (
    <span className="bios-cells" role="img" aria-label={label}>
      <span className={toneClass[tone]}>{'█'.repeat(f)}</span>
      <span className="text-bios-dim">{'░'.repeat(total - f)}</span>
    </span>
  );
}

/** Function-key legend, the setup utility's only navigation. Each key is a real button. */
export function KeyLegend({ keys }: { keys: { key: string; label: string; onClick?: () => void; disabled?: boolean }[] }) {
  return (
    <nav aria-label="Keys" className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-3 py-1">
      {keys.map((k) => (
        <button
          key={k.key}
          type="button"
          onClick={k.onClick}
          disabled={k.disabled}
          className="group flex items-baseline gap-2 text-bios-fg disabled:opacity-50 enabled:hover:text-bios-white"
        >
          <span className="text-bios-yellow group-disabled:text-bios-dim">{k.key}</span>
          <span>{k.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Bracketed BIOS value, e.g. [ $1,000 ]. On the selection bar everything is the selection ink. */
export function Bracket({ children, tone = 'white', selected = false }: { children: ReactNode; tone?: Tone; selected?: boolean }) {
  const bracket = selected ? 'text-bios-sel-fg' : 'text-bios-fg';
  return (
    <span className={selected ? 'text-bios-sel-fg' : toneClass[tone]}>
      <span className={bracket}>[ </span>{children}<span className={bracket}> ]</span>
    </span>
  );
}
