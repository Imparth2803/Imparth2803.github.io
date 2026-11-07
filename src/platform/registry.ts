/* The service registry: the one list of every tool on /services.
   The catalog, the router, the tool pages, their page titles and the sitemap
   (scripts/generate-sitemap.js) are all built from this list, so adding a
   service means adding one entry here (plus its folder once it is built).

   Keep this file free of imports: the sitemap script loads it outside the
   app bundle. */

export const SERVICE_CATEGORIES = [
  "Text and lists",
  "Spreadsheets",
  "Dates",
  "Images",
  "PDF"
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export type ServiceStatus = "coming-soon";

export interface ServiceDefinition {
  /** URL part: the tool lives at /services/<slug>. Lowercase words and dashes. */
  slug: string;
  name: string;
  /** One plain-language line for the catalog card. */
  summary: string;
  /** A few sentences for the tool page: what it does and who it helps. */
  description: string;
  category: ServiceCategory;
  /** Extra words people might search for (the name and summary are searched too). */
  keywords: readonly string[];
  /** Font Awesome 5 class names, e.g. "fas fa-cut". */
  icon: string;
  /** Title and description for search engines and link previews. */
  seo: {title: string; description: string};
  status: ServiceStatus;
}

export const services: readonly ServiceDefinition[] = [
  {
    slug: "text-splitter",
    name: "Text Splitter",
    summary: "Split text or a column into separate columns or rows.",
    description:
      "Paste text or open a spreadsheet and split each line wherever a separator appears, such as a comma, space or dash. Name the new columns, check the preview and download the result as a spreadsheet.",
    category: "Text and lists",
    keywords: ["split", "separate", "columns", "comma", "break apart"],
    icon: "fas fa-cut",
    seo: {
      title: "Text Splitter: split text into columns",
      description:
        "Split text or spreadsheet columns into separate columns or rows by a separator. Free, and your data never leaves your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "column-combiner",
    name: "Column Combiner",
    summary: "Join two or more columns into one, with a separator you choose.",
    description:
      "Open a spreadsheet, pick the columns to join (for example first name and last name) and choose what goes between them. Empty cells are handled without leaving stray separators.",
    category: "Spreadsheets",
    keywords: ["join", "merge", "concatenate", "combine", "full name"],
    icon: "fas fa-columns",
    seo: {
      title: "Column Combiner: join spreadsheet columns",
      description:
        "Join two or more spreadsheet columns into one with your own separator. Free, and your data never leaves your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "list-cleaner",
    name: "List Cleaner",
    summary:
      "Tidy a list: remove extra spaces, duplicates and blank lines, then sort.",
    description:
      "Paste a list and clean it in one go: trim spaces, remove unwanted characters, drop duplicates and blank lines, and sort it if you like. Each step runs in a fixed order so the result is predictable.",
    category: "Text and lists",
    keywords: ["duplicates", "dedupe", "trim", "sort", "clean", "tidy"],
    icon: "fas fa-broom",
    seo: {
      title: "List Cleaner: remove duplicates and tidy lists",
      description:
        "Remove duplicates, extra spaces and blank lines from a list and sort it. Free, and your data never leaves your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "two-list-comparator",
    name: "Two-List Comparator",
    summary: "Compare two lists to see what is in both, or only in one.",
    description:
      "Paste or open two lists and see which items appear in both, which are only in the first and which are only in the second. Duplicates in each list are counted so nothing is missed.",
    category: "Text and lists",
    keywords: ["compare", "difference", "match", "missing", "vlookup"],
    icon: "fas fa-balance-scale",
    seo: {
      title: "Two-List Comparator: find matches and differences",
      description:
        "Compare two lists to find shared items and items missing from either list. Free, and your data never leaves your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "bulk-image-resizer",
    name: "Bulk Image Resizer",
    summary: "Resize many images at once to the same size.",
    description:
      "Add a batch of photos or images, choose a size and how they should fit, and download them all together. Images are turned the right way up and transparent backgrounds are kept.",
    category: "Images",
    keywords: ["resize", "scale", "dimensions", "photos", "batch"],
    icon: "fas fa-expand-arrows-alt",
    seo: {
      title: "Bulk Image Resizer: resize many images at once",
      description:
        "Resize a batch of images to the same size and download them together. Free, and your images never leave your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "smart-image-compressor",
    name: "Smart Image Compressor",
    summary:
      "Make images smaller in file size while keeping them looking good.",
    description:
      "Add images and make their files smaller, either by picking a quality level or by aiming for a target file size. You see how much space each image saves before you download.",
    category: "Images",
    keywords: [
      "compress",
      "reduce size",
      "optimise",
      "optimize",
      "smaller",
      "jpeg",
      "webp"
    ],
    icon: "fas fa-compress-arrows-alt",
    seo: {
      title: "Smart Image Compressor: reduce image file size",
      description:
        "Reduce image file sizes by quality or target size. Free, and your images never leave your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "text-formatter",
    name: "Text Formatter",
    summary: "Change text case, fix spacing, and find and replace.",
    description:
      "Paste text and change it to UPPER CASE, lower case, Title Case or Sentence case, tidy up spacing and line breaks, or find and replace words throughout.",
    category: "Text and lists",
    keywords: [
      "uppercase",
      "lowercase",
      "title case",
      "find and replace",
      "case"
    ],
    icon: "fas fa-font",
    seo: {
      title: "Text Formatter: change case, spacing, find and replace",
      description:
        "Change text case, fix spacing and line breaks, and find and replace. Free, and your text never leaves your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "pdf-page-organizer",
    name: "PDF Page Organizer",
    summary: "Reorder, remove or combine PDF pages.",
    description:
      "Open one or more PDFs, see every page, then drag or use the keyboard to reorder, remove or rotate pages and save a new PDF. Pages keep their original quality.",
    category: "PDF",
    keywords: ["pdf", "reorder", "merge", "delete pages", "rotate", "combine"],
    icon: "fas fa-file-pdf",
    seo: {
      title: "PDF Page Organizer: reorder, remove and combine pages",
      description:
        "Reorder, remove, rotate and combine PDF pages without losing quality. Free, and your files never leave your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "date-time-formatter",
    name: "Smart Date & Time Formatter",
    summary: "Convert dates and times into the format you need.",
    description:
      "Paste or open a column of dates and change them to the format you need, or add days and months. If a date could be read two ways, such as 03/04, you are asked which one you mean.",
    category: "Dates",
    keywords: ["date", "time", "format", "convert", "add days", "working days"],
    icon: "fas fa-calendar-alt",
    seo: {
      title: "Smart Date & Time Formatter: convert date formats",
      description:
        "Convert columns of dates and times to any format and add days or months. Free, and your data never leaves your browser."
    },
    status: "coming-soon"
  },
  {
    slug: "csv-converter",
    name: "CSV Converter",
    summary:
      "Convert between CSV and Excel files without breaking IDs or numbers.",
    description:
      "Turn CSV files into Excel files and back. Employee IDs, phone numbers and codes with leading zeros stay exactly as they are, and non-English text opens correctly in Excel.",
    category: "Spreadsheets",
    keywords: [
      "csv",
      "excel",
      "xlsx",
      "convert",
      "spreadsheet",
      "leading zeros"
    ],
    icon: "fas fa-file-csv",
    seo: {
      title: "CSV Converter: convert CSV to Excel and back",
      description:
        "Convert CSV to Excel and Excel to CSV while keeping IDs and leading zeros intact. Free, and your files never leave your browser."
    },
    status: "coming-soon"
  }
];

export function findService(slug: string): ServiceDefinition | undefined {
  return services.find(service => service.slug === slug);
}
