import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true, async: false });

/**
 * Renders markdown to HTML. Raw HTML in the source passes through — this
 * is a single-user app: the only writers are the owner (behind Cloudflare
 * Access) and their AI assistant (behind the bearer token).
 */
export function renderMarkdown(src: string): string {
  return marked.parse(src) as string;
}
