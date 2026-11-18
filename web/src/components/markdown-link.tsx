import type { AnchorHTMLAttributes } from "react";

// Links in rendered Markdown (reports, company research, run logs, CV preview)
// open in a new tab, so reading a source never loses your place in the app.
// In-page anchors (#section) stay in the same tab.
export function MarkdownLink({ href, children, node: _node, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  const external = typeof href === "string" && !href.startsWith("#");
  return (
    <a href={href} {...props} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

export const markdownLinks = { a: MarkdownLink };
