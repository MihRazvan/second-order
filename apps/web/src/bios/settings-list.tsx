'use client';
import { useEffect, useRef, useState } from 'react';
import { Bracket, toneClass, type Tone } from './primitives';

export type ItemKind = 'readonly' | 'number' | 'enum' | 'text';

export interface SettingItem {
  id: string;
  label: string;
  /** Display value inside the brackets. */
  value: string;
  kind: ItemKind;
  tone?: Tone;
  /** +/- handler for number and enum items. */
  onDelta?: (dir: 1 | -1) => void;
  /** Enter / typing handler for number and text items; receives the raw string. */
  onEdit?: (raw: string) => void;
  placeholder?: string;
  /** Shown in the Item Specific Help panel. */
  help: string[];
  disabled?: boolean;
}

export interface Readout {
  id: string;
  label: string;
  value: string;
  tone: Tone;
  help: string[];
}

interface Props {
  items: SettingItem[];
  readouts: Readout[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Externally requested edit (Enter key). */
  editingId: string | null;
  onEditingChange: (id: string | null) => void;
}

/**
 * The setup-utility item list. One row per setting, brackets around values, a grey
 * selection bar. Mouse users click; keyboard users use ↑↓ and +/−; Enter edits inline.
 */
export function SettingsList({ items, readouts, selectedId, onSelect, editingId, onEditingChange }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editing = items.find((i) => i.id === editingId) ?? null;

  useEffect(() => {
    if (editing) { setDraft(editing.kind === 'text' ? '' : editing.value.replace(/[^0-9.]/g, '')); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => { if (editing?.onEdit) editing.onEdit(draft); onEditingChange(null); };

  return (
    <div className="px-2 py-1" role="listbox" aria-label="Settings" aria-activedescendant={`item-${selectedId}`}>
      {items.map((it) => {
        const selected = it.id === selectedId;
        const isEditing = editingId === it.id;
        return (
          <div
            key={it.id}
            id={`item-${it.id}`}
            role="option"
            aria-selected={selected}
            tabIndex={-1}
            onClick={() => { onSelect(it.id); if ((it.kind === 'text' || it.kind === 'number') && !it.disabled) onEditingChange(it.id); }}
            className={`grid cursor-default grid-cols-[minmax(160px,1fr)_minmax(0,1.3fr)] items-baseline gap-4 px-3 py-[1px] ${selected ? 'bios-selected' : ''} ${it.disabled ? 'opacity-60' : ''}`}
          >
            <span className="bios-label truncate">{it.label}</span>
            <span className="min-w-0 truncate">
              {isEditing ? (
                <span className="text-bios-sel-fg">
                  <span className="text-bios-sel-fg">[ </span>
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); onEditingChange(null); } e.stopPropagation(); }}
                    onBlur={commit}
                    placeholder={it.placeholder}
                    aria-label={it.label}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-[min(100%,34ch)] bg-transparent text-inherit outline-none placeholder:text-bios-dim"
                    style={{ font: 'inherit' }}
                  />
                  <span className="text-bios-sel-fg"> ]</span>
                </span>
              ) : (
                <Bracket selected={selected} tone={it.tone ?? 'white'}>{it.value || <span className={selected ? 'text-bios-sel-fg opacity-70' : 'text-bios-dim'}>{it.placeholder ?? '—'}</span>}</Bracket>
              )}
              {selected && it.kind !== 'readonly' && !isEditing && <span className="ml-3 text-bios-sel-fg opacity-70">{it.kind === 'text' ? '⏎ edit' : it.kind === 'enum' ? '+/−' : '+/− ⏎'}</span>}
            </span>
          </div>
        );
      })}
      {readouts.length > 0 && <div className="bios-rule mx-3 my-1" />}
      {readouts.map((r) => {
        const selected = r.id === selectedId;
        return (
          <div
            key={r.id}
            id={`item-${r.id}`}
            role="option"
            aria-selected={selected}
            tabIndex={-1}
            onClick={() => onSelect(r.id)}
            className={`grid cursor-default grid-cols-[minmax(160px,1fr)_minmax(0,1.3fr)] items-baseline gap-4 px-3 py-[1px] ${selected ? 'bios-selected' : ''}`}
          >
            <span className="bios-label truncate">{r.label}</span>
            <span className={`truncate ${selected ? '' : toneClass[r.tone]}`} data-readout={r.id}>{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}
