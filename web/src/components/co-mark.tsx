// Brand mark: a fox curled into a lowercase "c" (career-ops, and "companies": the word the
// manifesto inverts). White on a violet tile, same artwork as src/app/icon.svg.
//
// The tile is plain CSS, not an SVG gradient: the mark is rendered several times per page
// (sidebar, mobile nav, assistant) and an SVG `url(#id)` paint resolves to the FIRST element
// with that id, which can sit inside a display:none tree and then paints nothing.
export function CoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-[#9a6ce0] to-brand"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.23) }}
    >
      <svg viewBox="0 0 96 96" width={size} height={size}>
        <g fill="#fff">
          <path d="M60.85 35.15A21 21 0 1 0 60.85 64.85" fill="none" stroke="#fff" strokeWidth="13" />
          <path d="M52 32 L56 14 L62 25 L67 16 L71 28 C75 29 79 33 82 39 L83 42 C79 45 74 46 70 46 L66 51 L61 45 C58 44 56 42 54 40 Z" />
          <path d="M56 57 C68 63 79 60 85 49 C88 63 80 75 64 73 C60 72.5 57 71 55 68 Z" />
        </g>
        <path d="M79 59.5Q85 64 82 71.5" stroke="#8a5ad6" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <ellipse cx="70" cy="35.5" rx="2.2" ry="1.3" transform="rotate(25 70 35.5)" fill="#7c4dcc" />
        <circle cx="82" cy="41" r="1.5" fill="#7c4dcc" />
      </svg>
    </span>
  );
}
