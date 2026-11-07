import type {ServiceCategory, ServiceDefinition} from "./registry";

/* Lowercase, strip accents and collapse spaces so "Résumé  " matches "resume". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* Services matching every word of the query (in the name, summary, category
   or keywords) and, when given, the chosen category. Registry order is kept. */
export function filterServices(
  list: readonly ServiceDefinition[],
  query: string,
  category: ServiceCategory | null
): ServiceDefinition[] {
  const words = normalize(query).split(" ").filter(Boolean);
  return list.filter(service => {
    if (category && service.category !== category) return false;
    const haystack = normalize(
      [
        service.name,
        service.summary,
        service.category,
        ...service.keywords
      ].join(" ")
    );
    return words.every(word => haystack.includes(word));
  });
}
