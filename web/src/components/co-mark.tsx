// Brand mark — lowercase "co" in a bold sans on a violet disc. Dual meaning:
// "co" of career-ops AND "co" of companies — the word the manifesto inverts
// ("…AI to choose companies").
export function CoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#9a6ce0] to-brand font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.44),
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      co
    </span>
  );
}
