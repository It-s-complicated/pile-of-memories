<script lang="ts">
  import SvelteMarkdown, {
    allowRenderersOnly,
    buildUnsupportedHTML,
  } from "@humanspeak/svelte-markdown";
  import { isHttpUrl, type ParsedMarkdown } from "$lib/markdown";

  let { parsed }: { parsed: ParsedMarkdown } = $props();
  const renderers = {
    ...allowRenderersOnly([
      "rawtext",
      "escape",
      "heading",
      "paragraph",
      "blockquote",
      "code",
      "list",
      "listitem",
      "hr",
      "text",
      "link",
      "em",
      "strong",
      "codespan",
      "br",
      "del",
      "orderedlistitem",
      "unorderedlistitem",
    ]),
    html: buildUnsupportedHTML(),
  };
</script>

<SvelteMarkdown source={parsed.tokens} {renderers} options={{ gfm: true, breaks: true }}>
  {#snippet link({ href, title, children })}
    <a
      {href}
      {title}
      target={href && isHttpUrl(href) ? "_blank" : undefined}
      rel={href && isHttpUrl(href) ? "noopener noreferrer" : undefined}
    >
      {@render children?.()}
    </a>
  {/snippet}

  {#snippet listitem({ task, checked, children })}
    <li>
      {#if task}
        <input type="checkbox" {checked} disabled aria-label={checked ? "Completed" : "Not completed"} />
      {/if}
      {@render children?.()}
    </li>
  {/snippet}

  {#snippet heading({ children })}
    <h3>{@render children?.()}</h3>
  {/snippet}

  {#snippet code({ text })}
    <pre><code>{text}</code></pre>
  {/snippet}
</SvelteMarkdown>
