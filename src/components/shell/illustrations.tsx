/** Simple line-art illustrations for empty panels (inline SVG, theme-neutral). */

const stroke = { stroke: "#1f2937", strokeWidth: 2.2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Person({ smile }: { smile: boolean }) {
  return (
    <g {...stroke}>
      {/* head */}
      <path d="M150 40 C138 44 132 58 134 72 L128 84 L138 86 C140 98 150 104 160 102 C172 100 178 88 176 74 C182 72 184 64 178 60 C176 46 164 36 150 40 Z" fill="#fff" />
      <path d="M146 38 C152 30 168 30 174 40 C176 46 176 52 174 56" fill="#1f2937" stroke="none" />
      <circle cx="152" cy="68" r="1.6" fill="#1f2937" stroke="none" />
      <circle cx="162" cy="68" r="1.6" fill="#1f2937" stroke="none" />
      {smile ? <path d="M151 82 Q157 88 163 82" /> : <path d="M151 86 Q157 81 163 86" />}
      {/* thinking hand + arm */}
      <path d="M150 104 C146 110 150 118 158 118 L162 132" />
      <path d="M158 118 C166 116 170 108 168 100" />
      {/* body */}
      <path d="M128 112 C110 120 98 140 92 160" />
      <path d="M176 110 C192 120 202 136 208 150" />
      <path d="M140 120 L136 190" />
      <path d="M172 120 L176 190" />
      <path d="M152 124 L150 150 L156 160 L152 190" />
      {/* hand on board */}
      <path d="M92 160 C86 162 80 166 76 166" />
      <path d="M176 168 C184 170 190 176 188 184 L182 192" />
    </g>
  );
}

function Board({ children }: { children?: React.ReactNode }) {
  return (
    <g {...stroke}>
      <rect x="22" y="58" width="62" height="118" rx="10" fill="#fff" />
      <rect x="30" y="52" width="62" height="118" rx="10" fill="#fff" />
      {children}
    </g>
  );
}

export function TasksDoneIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 230 200" className={className} aria-hidden="true">
      <Board>
        <circle cx="44" cy="70" r="4" strokeWidth={1.6} />
        <path d="M42 70 L44 72 L47 68" strokeWidth={1.4} />
        <path d="M54 70 L82 70" strokeWidth={1.6} />
        {[86, 98, 110, 122, 134, 146].map((y) => (
          <path key={y} d={`M42 ${y} L82 ${y}`} stroke="#cbd5e1" strokeWidth={1.4} />
        ))}
      </Board>
      <Person smile />
    </svg>
  );
}

export function NothingHereIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 230 200" className={className} aria-hidden="true">
      <Board>
        <path d="M46 100 L46 122 L76 122 L76 104 L60 104 L56 100 Z" strokeWidth={1.8} />
        <circle cx="74" cy="122" r="7" fill="#fff" strokeWidth={1.8} />
        <path d="M71 119 L77 125 M77 119 L71 125" strokeWidth={1.6} />
      </Board>
      <Person smile={false} />
    </svg>
  );
}
