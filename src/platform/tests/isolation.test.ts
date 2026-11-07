import fs from "fs";
import path from "path";

/* Tools may use src/shared and src/platform, but never each other's code,
   so one tool breaking (or being removed) can't affect another. */
const servicesDir = path.join(__dirname, "..", "..", "services");

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

const IMPORT =
  /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|new URL\(\s*["']([^"']+)["']/g;

describe("tool isolation", () => {
  const tools = fs
    .readdirSync(servicesDir)
    .filter(name => fs.statSync(path.join(servicesDir, name)).isDirectory());

  it("finds the tools", () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it.each(tools)(
    "%s only imports its own files, shared and platform code",
    tool => {
      const ownDir = path.join(servicesDir, tool);
      const problems: string[] = [];
      for (const file of filesIn(ownDir)) {
        const text = fs.readFileSync(file, "utf8");
        for (const match of Array.from(text.matchAll(IMPORT))) {
          const spec = match[1] ?? match[2] ?? match[3] ?? match[4];
          if (!spec || !spec.startsWith(".")) continue;
          const target = path.resolve(path.dirname(file), spec);
          if (
            target.startsWith(servicesDir + path.sep) &&
            !target.startsWith(ownDir + path.sep)
          ) {
            problems.push(
              `${path.relative(servicesDir, file)} imports ${spec}`
            );
          }
        }
      }
      expect(problems).toEqual([]);
    }
  );
});
