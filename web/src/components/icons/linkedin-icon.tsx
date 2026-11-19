import type { SVGProps } from "react";

// LinkedIn "in" mark: a rounded square with the dot, "i" and "n" cut out (evenodd),
// so it inherits the surrounding text colour like the lucide icons around it.
export function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M3.8 2h16.4A1.8 1.8 0 0 1 22 3.8v16.4a1.8 1.8 0 0 1-1.8 1.8H3.8A1.8 1.8 0 0 1 2 20.2V3.8A1.8 1.8 0 0 1 3.8 2ZM6.45 4.75a1.74 1.74 0 1 0 0 3.48 1.74 1.74 0 0 0 0-3.48ZM4.94 9.43v9.59h2.98V9.43H4.94Zm4.83 0v9.59h2.98V13.9c0-1.3.75-2 1.85-2 1 0 1.48.6 1.48 1.9v5.22h2.98V13c0-2.3-1.06-3.75-3.16-3.75-1.3 0-2.4.65-3.15 1.62V9.43H9.77Z"
      />
    </svg>
  );
}
