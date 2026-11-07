/* Writes public/sitemap.xml and public/robots.txt before each build.
   Pages come from the app itself: the fixed pages, every blog post that is
   not a draft, and every tool in the service registry. The site address is
   REACT_APP_SITE_URL from .env.production, so the domain is never written
   into code. Both output files are generated, so they are not committed. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
require("dotenv").config({path: path.join(__dirname, "..", ".env.production")});

const root = path.join(__dirname, "..");
const siteUrl = (process.env.REACT_APP_SITE_URL || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(siteUrl)) {
  throw new Error("REACT_APP_SITE_URL must be set in .env.production");
}

/* Load the TypeScript registry without the app bundler. It has no imports. */
function loadRegistry() {
  const file = path.join(root, "src", "platform", "registry.ts");
  const {outputText} = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019
    }
  });
  const module = {exports: {}};
  new Function("module", "exports", outputText)(module, module.exports);
  return module.exports.services;
}

function blogSlugs() {
  const dir = path.join(root, "src", "blog", "posts");
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith(".md"))
    .filter(name => {
      const head =
        fs.readFileSync(path.join(dir, name), "utf8").split(/^---$/m)[1] || "";
      return !/^\s*draft:\s*true\s*$/m.test(head);
    })
    .map(name => name.replace(/\.md$/, ""));
}

const paths = [
  "/",
  "/blog",
  ...blogSlugs().map(slug => `/blog/${slug}`),
  "/community",
  "/services",
  ...loadRegistry().map(service => `/services/${service.slug}`)
];

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  paths.map(p => `  <url><loc>${siteUrl}${p}</loc></url>`).join("\n") +
  "\n</urlset>\n";

fs.writeFileSync(path.join(root, "public", "sitemap.xml"), sitemap);
fs.writeFileSync(
  path.join(root, "public", "robots.txt"),
  `# https://www.robotstxt.org/robotstxt.html\nUser-agent: *\nDisallow:\n\nSitemap: ${siteUrl}/sitemap.xml\n`
);
console.log(`Sitemap written with ${paths.length} pages.`);
