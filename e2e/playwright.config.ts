import {defineConfig, devices} from "@playwright/test";

/* End-to-end tests run against the production build (npm run build first),
   served like GitHub Pages serves it. Run with: npm run test:e2e

   The timing tests (performance.spec.ts) run last, one at a time, so other
   tests running in parallel can't make the page look slower than it is.
   The Image Editor's heavy timing tests (image-editor-performance.spec.ts)
   run after those, on their own, so they can't slow the others down. */
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5056",
    acceptDownloads: true
  },
  webServer: {
    command: "node serve.js ../build 5056",
    url: "http://localhost:5056/",
    reuseExistingServer: false
  },
  projects: [
    {
      name: "chromium",
      use: {...devices["Desktop Chrome"]},
      testIgnore: /performance/
    },
    {
      name: "firefox",
      use: {...devices["Desktop Firefox"]},
      testIgnore: /performance/
    },
    {
      // Safari's engine. Close to Safari, but not the same as testing in
      // Safari itself.
      name: "webkit",
      use: {...devices["Desktop Safari"]},
      testIgnore: /performance/
    },
    {
      name: "timing-chromium",
      use: {...devices["Desktop Chrome"]},
      testMatch: /performance/,
      testIgnore: /image-editor-performance/,
      dependencies: ["chromium", "firefox", "webkit"]
    },
    {
      name: "timing-firefox",
      use: {...devices["Desktop Firefox"]},
      testMatch: /performance/,
      testIgnore: /image-editor-performance/,
      dependencies: ["timing-chromium"]
    },
    {
      name: "timing-editor-chromium",
      use: {...devices["Desktop Chrome"]},
      testMatch: /image-editor-performance/,
      dependencies: ["timing-firefox"]
    },
    {
      name: "timing-editor-firefox",
      use: {...devices["Desktop Firefox"]},
      testMatch: /image-editor-performance/,
      dependencies: ["timing-editor-chromium"]
    }
  ]
});
