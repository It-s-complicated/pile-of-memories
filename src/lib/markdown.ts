import { Lexer, marked, type Token, type TokensList } from "marked";
import { z } from "zod";

export type ParsedMarkdown = { tokens: Token[]; links: string[] };

export const httpUrlSchema = z.url({ protocol: /^https?$/ });

export function isHttpUrl(value: string): boolean {
  return httpUrlSchema.safeParse(value).success;
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const tokens = Lexer.lex(source, { gfm: true, breaks: true }) as TokensList;
  const links: string[] = [];
  const seen = new Set<string>();

  void marked.walkTokens(tokens, (token) => {
    if (token.type !== "link" || !isHttpUrl(token.href) || seen.has(token.href)) return;
    seen.add(token.href);
    links.push(token.href);
  });

  return { tokens, links };
}
