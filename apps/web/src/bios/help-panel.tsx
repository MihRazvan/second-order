'use client';

/** Item Specific Help: the setup utility's right column. Product language only. */
export function HelpPanel({ title, lines, footer }: { title: string; lines: string[]; footer?: string[] }) {
  return (
    <div className="flex h-full flex-col px-4 py-2">
      <h3 className="bios-title text-center leading-none">Item Specific Help</h3>
      <div className="bios-rule mt-2" />
      <div className="mt-3 text-bios-white">{title}</div>
      <div className="mt-2 space-y-3 text-bios-fg">
        {lines.map((l, i) => <p key={i} className="leading-[1.2]">{l}</p>)}
      </div>
      {footer && (
        <div className="mt-auto space-y-1 pt-3 text-bios-dim">
          {footer.map((l, i) => <p key={i} className="leading-[1.2]">{l}</p>)}
        </div>
      )}
    </div>
  );
}
