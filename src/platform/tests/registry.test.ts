import {SERVICE_CATEGORIES, findService, services} from "../registry";
import {filterServices} from "../catalogSearch";
import {matchRoute} from "../../utils/router";

describe("service registry", () => {
  it("lists the 11 tools (10 planned, plus the image editor)", () => {
    expect(services).toHaveLength(11);
  });

  it("gives every tool a unique, URL-safe slug", () => {
    const slugs = services.map(s => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    slugs.forEach(slug => expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it("fills in the text every page needs", () => {
    services.forEach(s => {
      expect(s.name.trim()).not.toBe("");
      expect(s.summary.trim()).not.toBe("");
      expect(s.description.trim()).not.toBe("");
      expect(s.seo.title.trim()).not.toBe("");
      expect(s.seo.description.length).toBeLessThanOrEqual(160);
      expect(s.icon).toMatch(/^fas fa-[a-z-]+$/);
    });
  });

  it("uses every category at least once", () => {
    SERVICE_CATEGORIES.forEach(category =>
      expect(services.some(s => s.category === category)).toBe(true)
    );
  });

  it("finds a tool by slug", () => {
    expect(findService("csv-converter")?.name).toBe("CSV Converter");
    expect(findService("nope")).toBeUndefined();
  });
});

describe("catalog search", () => {
  const names = (
    query: string,
    category: Parameters<typeof filterServices>[2] = null
  ) => filterServices(services, query, category).map(s => s.name);

  it("shows everything for an empty search", () => {
    expect(names("")).toHaveLength(services.length);
    expect(names("   ")).toHaveLength(services.length);
  });

  it("matches keywords, ignoring case and accents", () => {
    expect(names("DUPLICATES")).toContain("List Cleaner");
    expect(names("excel")).toContain("CSV Converter");
    expect(names("pdf")).toEqual(["PDF Page Organizer"]);
  });

  it("needs every word to match", () => {
    expect(names("resize images")).toEqual(["Bulk Image Resizer"]);
    expect(names("resize pdf")).toEqual([]);
  });

  it("filters by category", () => {
    expect(names("", "Images")).toEqual([
      "Bulk Image Resizer",
      "Smart Image Compressor",
      "Image Editor"
    ]);
  });
});

describe("routes", () => {
  it("keeps the portfolio and blog routes", () => {
    expect(matchRoute("/").name).toBe("home");
    expect(matchRoute("/blog").name).toBe("blogIndex");
    expect(matchRoute("/blog/hello-world")).toEqual({
      name: "blogPost",
      slug: "hello-world"
    });
    expect(matchRoute("/community").name).toBe("community");
  });

  it("opens the catalog and each registered tool", () => {
    expect(matchRoute("/services").name).toBe("services");
    expect(matchRoute("/services/").name).toBe("services");
    services.forEach(s => {
      expect(matchRoute(`/services/${s.slug}`)).toEqual({
        name: "service",
        service: s
      });
    });
  });

  it("treats unknown tools as not found", () => {
    expect(matchRoute("/services/unknown-tool").name).toBe("notFound");
  });
});
