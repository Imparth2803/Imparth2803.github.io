/* One shared number formatter ("1,204"). Creating a formatter loads the
   browser's language data, which can take ~20 ms the first time; doing it
   once, when a tool loads, keeps that pause out of button clicks. */
const formatter = new Intl.NumberFormat("en");

export function formatCount(n: number): string {
  return formatter.format(n);
}
