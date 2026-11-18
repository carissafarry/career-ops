import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownLinks } from "@/components/markdown-link";
import { noMarkdownImages } from "@/lib/markdown-options.mjs";

export default function AssistantMarkdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownLinks} {...noMarkdownImages}>{text}</ReactMarkdown>;
}
