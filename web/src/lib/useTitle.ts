import {useEffect} from "react";

/** Matches the `<title>` in index.html, which is what the arena route uses. */
export const DEFAULT_TITLE = "either: the internet's arena.";

/**
 * Stands in for Next's per-route `export const metadata`.
 *
 * Only the title is set: the description and og/twitter tags are static across
 * both routes, so they stay in index.html where crawlers see them without
 * running the bundle.
 */
export function useTitle(title: string = DEFAULT_TITLE): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
