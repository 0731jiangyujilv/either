import GithubSlugger from "github-slugger";
import {useMemo} from "react";
import Markdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import {AppShell} from "@/components/AppShell";
import {useTitle} from "@/lib/useTitle";

// Next read this off disk with node:fs at request time. Vite inlines it into
// the bundle at build time instead, so the page needs no server.
import markdown from "@/content/docs.md?raw";

type Heading = {level: 1 | 2; text: string; slug: string};

/**
 * Pull the h1/h2 headings for the sidebar.
 *
 * `rehype-slug` gives the rendered headings their ids using github-slugger, so
 * the same slugger here produces matching anchors, including its de-duplication
 * of repeated titles.
 */
function buildToc(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,2})\s+(.*)$/.exec(line);
    if (!match) continue;

    // strip inline emphasis so the sidebar reads as plain text
    const text = match[2].replace(/[*_`]/g, "").trim();
    headings.push({
      level: match[1].length as 1 | 2,
      text,
      slug: slugger.slug(text),
    });
  }

  return headings;
}

export function DocsPage() {
  useTitle("docs — either");

  // the markdown is a build-time constant, so the toc only needs building once
  const toc = useMemo(() => buildToc(markdown), []);

  return (
    <AppShell brandAsLink>
      <div className="docs">
        <nav className="docs__toc" aria-label="contents">
          <ul className="docs__toc-list">
            {toc.map((heading) => (
              <li
                key={heading.slug}
                className={`docs__toc-item--h${heading.level}`}
              >
                <a href={`#${heading.slug}`}>{heading.text}</a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="prose">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            components={{
              // wide tables scroll inside their own box rather than the page
              table: ({children}) => (
                <div className="prose__table-wrap">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {markdown}
          </Markdown>
        </article>
      </div>
    </AppShell>
  );
}
