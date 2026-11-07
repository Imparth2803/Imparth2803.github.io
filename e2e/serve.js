/* Serves the production build the way GitHub Pages does: real files as-is,
   404.html (with status 404) for every other path. Used by the e2e tests. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || "build");
const port = Number(process.argv[3] || 5056);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".md": "text/markdown",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".pdf": "application/pdf"
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname
    );
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    if (urlPath.endsWith("/")) file = path.join(file, "index.html");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, {"content-type": types[".html"]});
      return res.end(fs.readFileSync(path.join(root, "404.html")));
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream"
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () =>
    console.log(`Serving ${root} on http://localhost:${port}`)
  );
