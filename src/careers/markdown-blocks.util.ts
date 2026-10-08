import { marked } from 'marked';
import type { Token, Tokens } from 'marked';

/**
 * One piece of a rendered advert, in the shape the careers site's job view
 * draws. Exactly one key is set per block.
 */
export interface DescriptionBlock {
  /** Section heading. */
  h?: string;
  /** Paragraph. Soft line breaks survive as "\n". */
  p?: string;
  /** Bullet list. */
  ul?: string[];
  /** A bold lead-in line, e.g. "Strongly preferred:". */
  strong?: string;
}

/**
 * Turns a job advert written in markdown into the blocks the website renders.
 *
 * Adverts are authored and stored as markdown — that is what the admin form
 * writes and what `description_mdx` holds. The careers site's job view, by
 * contrast, renders a list of typed blocks and has no markdown parser. The
 * conversion happens here, on the way out, so the authoring format stays
 * markdown and the page keeps the component it already has.
 *
 * Only the four constructs the page can draw are produced. Anything else a
 * writer uses — a table, a code fence, an image — degrades to a paragraph of
 * its own text rather than being dropped, because silently losing a section of
 * an advert is worse than rendering it plainly.
 *
 * Inline markup is deliberately flattened to text. The page's blocks carry
 * strings, not rich nodes, so emphasis and links inside a sentence cannot
 * survive; a link's text is kept and its URL is not. Writers should put a URL
 * in full if they need it clickable.
 */
export function toDescriptionBlocks(
  markdown: string | null,
): DescriptionBlock[] {
  if (!markdown?.trim()) return [];

  const blocks: DescriptionBlock[] = [];

  for (const token of marked.lexer(markdown)) {
    const block = toBlock(token);
    if (block) blocks.push(block);
  }

  return blocks;
}

function toBlock(token: Token): DescriptionBlock | null {
  switch (token.type) {
    case 'heading':
      return { h: (token as Tokens.Heading).text.trim() };

    case 'paragraph': {
      const paragraph = token as Tokens.Paragraph;
      // A paragraph that is nothing but bold text is the page's "strong"
      // block — a lead-in line such as "Strongly preferred:" — rather than an
      // ordinary paragraph that happens to be emphasised.
      const inline = paragraph.tokens ?? [];
      if (inline.length === 1 && inline[0].type === 'strong') {
        return { strong: (inline[0] as Tokens.Strong).text.trim() };
      }
      return { p: paragraph.text };
    }

    case 'list':
      return {
        ul: (token as Tokens.List).items.map((item) => item.text.trim()),
      };

    // Blank lines carry no content, and a rule has nothing to draw.
    case 'space':
    case 'hr':
      return null;

    default: {
      // Everything else keeps its text rather than disappearing.
      const text = (token as { text?: string }).text?.trim();
      return text ? { p: text } : null;
    }
  }
}
