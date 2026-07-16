import { Lexer, marked, type Token, type TokensList } from "marked";

export type ParsedMarkdown = { tokens: Token[]; links: string[] };

export function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
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
