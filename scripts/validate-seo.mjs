import fs from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve("dist");
const SITE_URL = "https://www.snapcase.ai";

const fail = (message) => {
  throw new Error(message);
};

const getMatches = (html, pattern) => [...html.matchAll(pattern)].map((match) => match[1]);

const collectIndexFiles = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectIndexFiles(fullPath)));
    if (entry.isFile() && entry.name === "index.html") files.push(fullPath);
  }
  return files;
};

const routeFromFile = (file) => {
  const relativeDirectory = path.relative(DIST, path.dirname(file)).replaceAll("\\", "/");
  return relativeDirectory ? `/${relativeDirectory}` : "/";
};

const indexFiles = await collectIndexFiles(DIST);
const canonicals = new Set();

for (const file of indexFiles) {
  const html = await fs.readFile(file, "utf8");
  const route = routeFromFile(file);
  const titles = getMatches(html, /<title>([^<]+)<\/title>/g);
  const descriptions = getMatches(html, /<meta\s+name="description"\s+content="([^"]+)"\s*\/?>/g);
  const robots = getMatches(html, /<meta\s+name="robots"\s+content="([^"]+)"\s*\/?>/g);
  const canonical = getMatches(html, /<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/g);
  const ogUrl = getMatches(html, /<meta\s+property="og:url"\s+content="([^"]+)"\s*\/?>/g);
  const ogImage = getMatches(html, /<meta\s+property="og:image"\s+content="([^"]+)"\s*\/?>/g);

  if (titles.length !== 1) fail(`${route}: expected one title, found ${titles.length}`);
  if (descriptions.length !== 1) fail(`${route}: expected one description, found ${descriptions.length}`);
  if (robots.length !== 1 || robots[0] !== "index,follow") fail(`${route}: invalid robots metadata`);
  if (canonical.length !== 1) fail(`${route}: expected one canonical, found ${canonical.length}`);
  if (ogUrl.length !== 1 || ogUrl[0] !== canonical[0]) fail(`${route}: og:url does not match canonical`);
  if (ogImage.length !== 1) fail(`${route}: expected one og:image, found ${ogImage.length}`);

  const expectedCanonical = route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}`;
  if (canonical[0] !== expectedCanonical) {
    fail(`${route}: expected canonical ${expectedCanonical}, found ${canonical[0]}`);
  }
  if (canonicals.has(canonical[0])) fail(`${route}: duplicate canonical ${canonical[0]}`);
  canonicals.add(canonical[0]);

  if (route.startsWith("/phone-cases/") && ogImage[0] === `${SITE_URL}/og-image.png`) {
    fail(`${route}: product metadata still uses the generic social image`);
  }
}

const sitemap = await fs.readFile(path.join(DIST, "sitemap.xml"), "utf8");
const sitemapUrls = new Set(getMatches(sitemap, /<loc>([^<]+)<\/loc>/g));
if (sitemapUrls.size !== canonicals.size) fail("Sitemap and canonical route counts differ");
for (const canonical of canonicals) {
  if (!sitemapUrls.has(canonical)) fail(`Sitemap is missing ${canonical}`);
}

const robots = await fs.readFile(path.join(DIST, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) fail("robots.txt uses the wrong sitemap host");

const appFallback = await fs.readFile(path.join(DIST, "app.html"), "utf8");
if (!appFallback.includes('name="robots" content="noindex,nofollow"')) {
  fail("SPA fallback must remain noindex,nofollow");
}
if (/rel="canonical"/.test(appFallback)) fail("SPA fallback must not publish a homepage canonical");

const textOutputs = [
  sitemap,
  robots,
  appFallback,
  ...(await Promise.all(indexFiles.map((file) => fs.readFile(file, "utf8")))),
];
if (textOutputs.some((content) => /https:\/\/snapcase\.ai(?:[/'"<]|$)/.test(content))) {
  fail("Built SEO output still contains the noncanonical apex host");
}

console.log(`SEO contract passed for ${canonicals.size} canonical routes.`);
