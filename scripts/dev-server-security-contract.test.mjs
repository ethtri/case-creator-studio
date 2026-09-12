import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
);
const packageLock = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
);
const viteConfig = readFileSync(resolve(repositoryRoot, "vite.config.ts"), "utf8");
const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
const entryServer = readFileSync(
  resolve(repositoryRoot, "src/entry-server.tsx"),
  "utf8",
);

test("React Router uses the patched v7 line and supported entry points", () => {
  assert.equal(packageJson.dependencies["react-router"], "^7.18.3");
  assert.equal(packageJson.dependencies["react-router-dom"], undefined);
  assert.equal(packageLock.packages["node_modules/react-router"].version, "7.18.3");
  assert.match(entryServer, /StaticRouter } from ["']react-router["']/);
  assert.doesNotMatch(entryServer, /react-router-dom/);
});

test("Vite tooling stays on the patched compatible release line", () => {
  assert.equal(packageJson.devDependencies.vite, "6.4.3");
  assert.equal(packageJson.devDependencies["@vitejs/plugin-react-swc"], "4.3.3");
  assert.equal(packageLock.packages[""].devDependencies.vite, "6.4.3");
  assert.equal(
    packageLock.packages[""].devDependencies["@vitejs/plugin-react-swc"],
    "4.3.3",
  );
});

test("development is loopback-only unless LAN access is explicit", () => {
  assert.equal(packageJson.scripts.dev, "vite");
  assert.equal(packageJson.scripts["dev:network"], "vite --host 0.0.0.0");
  assert.match(viteConfig, /host:\s*["']127\.0\.0\.1["']/);
  assert.doesNotMatch(viteConfig, /host:\s*(?:true|["']::["'])/);
  assert.match(readme, /binds to loopback by default/i);
  assert.match(readme, /trusted local network/i);
});
