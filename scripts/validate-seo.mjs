import fs from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve("dist");
const SITE_URL = "https://www.snapcase.ai";

const fail = (message) => {
  throw new Error(message);
};

const getMatches = (html, pattern) => [...html.matchAll(pattern)].map((match) => match[1]);

const getJsonLd = (route, html) =>
  getMatches(html, /<script\s+type="application\/ld\+json">(.*?)<\/script>/gs).map((value) => {
    try {
      return JSON.parse(value);
    } catch {
      fail(`${route}: contains invalid JSON-LD`);
    }
  });

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

const assertLocalImageExists = async (route, value, label) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${route}: ${label} is not an absolute URL`);
  }

  if (url.origin !== SITE_URL) fail(`${route}: ${label} uses a noncanonical host`);
  if (url.pathname.startsWith("/src/")) fail(`${route}: ${label} exposes a source asset URL`);

  const assetPath = path.resolve(DIST, `.${decodeURIComponent(url.pathname)}`);
  if (!assetPath.startsWith(`${DIST}${path.sep}`)) fail(`${route}: ${label} escapes dist`);

  let stat;
  try {
    stat = await fs.stat(assetPath);
  } catch {
    fail(`${route}: ${label} does not resolve to a built file (${url.pathname})`);
  }
  if (!stat.isFile()) fail(`${route}: ${label} does not resolve to a built file (${url.pathname})`);
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
  const twitterImage = getMatches(html, /<meta\s+name="twitter:image"\s+content="([^"]+)"\s*\/?>/g);

  if (titles.length !== 1) fail(`${route}: expected one title, found ${titles.length}`);
  if (descriptions.length !== 1) fail(`${route}: expected one description, found ${descriptions.length}`);
  if (robots.length !== 1 || robots[0] !== "index,follow") fail(`${route}: invalid robots metadata`);
  if (canonical.length !== 1) fail(`${route}: expected one canonical, found ${canonical.length}`);
  if (ogUrl.length !== 1 || ogUrl[0] !== canonical[0]) fail(`${route}: og:url does not match canonical`);
  if (ogImage.length !== 1) fail(`${route}: expected one og:image, found ${ogImage.length}`);
  if (twitterImage.length !== 1 || twitterImage[0] !== ogImage[0]) {
    fail(`${route}: twitter:image does not match og:image`);
  }

  const expectedCanonical = route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}`;
  if (canonical[0] !== expectedCanonical) {
    fail(`${route}: expected canonical ${expectedCanonical}, found ${canonical[0]}`);
  }
  if (canonicals.has(canonical[0])) fail(`${route}: duplicate canonical ${canonical[0]}`);
  canonicals.add(canonical[0]);

  if (route.startsWith("/phone-cases/") && ogImage[0] === `${SITE_URL}/og-image.png`) {
    fail(`${route}: product metadata still uses the generic social image`);
  }
  await assertLocalImageExists(route, ogImage[0], "og:image");

  if (route.startsWith("/phone-cases/")) {
    const product = getJsonLd(route, html).find((value) => value?.["@type"] === "Product");
    if (!product) fail(`${route}: missing Product JSON-LD`);
    if (product.url !== canonical[0]) fail(`${route}: Product JSON-LD URL does not match canonical`);
    if (product.image !== ogImage[0]) fail(`${route}: Product JSON-LD image does not match og:image`);
    if (product.offers?.url !== canonical[0]) {
      fail(`${route}: Product offer URL does not match canonical`);
    }
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
