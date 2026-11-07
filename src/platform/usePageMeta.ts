import {useEffect} from "react";

/* Sets the tab title and the search-engine description for one page, and
   puts the site defaults back when the page closes. */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    const previousTitle = document.title;
    const previousDescription = meta ? meta.content : null;
    document.title = title;
    if (meta) meta.content = description;
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) {
        meta.content = previousDescription;
      }
    };
  }, [title, description]);
}
