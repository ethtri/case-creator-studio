import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const baseRoutes = [
  {
    path: "/",
    title: "Snapcase | Design Custom Phone Cases",
    description:
      "Design a custom phone case in minutes. Personalized iPhone and Samsung cases printed for U.S. shipping.",
    canonical: "https://snapcase.ai/",
    ogTitle: "Snapcase | Print Your Story",
    ogDescription:
      "Design a personalized phone case in minutes and send a custom gift they will actually use.",
    ogUrl: "https://snapcase.ai/",
    ogImage: "https://snapcase.ai/og-image.png",
    twitterTitle: "Snapcase | Print Your Story",
    twitterDescription: "Design a personalized phone case in minutes.",
    twitterImage: "https://snapcase.ai/og-image.png",
    robots: "index,follow",
  },
  {
    path: "/catalog",
    title: "Phone Case Catalog | Snapcase",
    description:
      "Browse iPhone and Samsung phone cases to start your custom Snapcase design.",
    canonical: "https://snapcase.ai/catalog",
    ogTitle: "Phone Case Catalog | Snapcase",
    ogDescription:
      "Browse iPhone and Samsung phone cases to start your custom Snapcase design.",
    ogUrl: "https://snapcase.ai/catalog",
    ogImage: "https://snapcase.ai/og-image.png",
    twitterTitle: "Phone Case Catalog | Snapcase",
    twitterDescription:
      "Browse iPhone and Samsung phone cases to start your custom Snapcase design.",
    twitterImage: "https://snapcase.ai/og-image.png",
    robots: "index,follow",
  },
];

const templatePath = path.resolve("dist", "index.html");
const spaFallbackPath = path.resolve("dist", "app.html");
const assetsDir = path.resolve("dist", "assets");

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const replaceOrThrow = (html, pattern, replacement, label) => {
  if (!pattern.test(html)) {
    throw new Error(`Missing ${label} in template.`);
  }
  return html.replace(pattern, replacement);
};

const applySeo = (html, seo) => {
  const title = `<title>${escapeHtml(seo.title)}</title>`;
  const description = `<meta name="description" content="${escapeHtml(seo.description)}" />`;
  const canonical = `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`;
  const robots = `<meta name="robots" content="${escapeHtml(seo.robots)}" />`;
  const ogTitle = `<meta property="og:title" content="${escapeHtml(seo.ogTitle)}" />`;
  const ogDescription = `<meta property="og:description" content="${escapeHtml(seo.ogDescription)}" />`;
  const ogUrl = `<meta property="og:url" content="${escapeHtml(seo.ogUrl)}" />`;
  const ogImage = `<meta property="og:image" content="${escapeHtml(seo.ogImage)}" />`;
  const twitterTitle = `<meta name="twitter:title" content="${escapeHtml(seo.twitterTitle)}" />`;
  const twitterDescription = `<meta name="twitter:description" content="${escapeHtml(seo.twitterDescription)}" />`;
  const twitterImage = `<meta name="twitter:image" content="${escapeHtml(seo.twitterImage)}" />`;

  let updated = html;
  updated = replaceOrThrow(updated, /<title>.*?<\/title>/, title, "title");
  updated = replaceOrThrow(
    updated,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    description,
    "meta description"
  );
  updated = replaceOrThrow(
    updated,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    canonical,
    "canonical"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/,
    robots,
    "robots"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    ogTitle,
    "og:title"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    ogDescription,
    "og:description"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    ogUrl,
    "og:url"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
    ogImage,
    "og:image"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    twitterTitle,
    "twitter:title"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    twitterDescription,
    "twitter:description"
  );
  updated = replaceOrThrow(
    updated,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
    twitterImage,
    "twitter:image"
  );

  return updated;
};

const injectAppHtml = (html, appHtml) =>
  replaceOrThrow(
    html,
    /<div id="root"><\/div>/,
    `<div id="root">${appHtml}</div>`,
    "root markup"
  );

const resolveAsset = async (basename) => {
  const files = await fs.readdir(assetsDir);
  const match = files.find((file) => file.startsWith(`${basename}-`));
  if (!match) {
    throw new Error(`Missing built asset for ${basename}.`);
  }
  return `/assets/${match}`;
};

const replaceAssetUrls = (html, assetMap) => {
  let updated = html;
  for (const [source, target] of Object.entries(assetMap)) {
    updated = updated.replaceAll(source, target);
  }
  return updated;
};

const buildSitemap = (routes) => {
  const entries = routes
    .map(
      (route) => `  <url>
    <loc>${escapeHtml(route.canonical)}</loc>
    <changefreq>${escapeHtml(route.changefreq ?? "weekly")}</changefreq>
    <priority>${escapeHtml(route.priority ?? "0.5")}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
};

const renderRoutes = async () => {
  const template = await fs.readFile(templatePath, "utf8");
  await fs.writeFile(spaFallbackPath, template, "utf8");
  const assetMap = {
    "/src/assets/hero-wide.png": await resolveAsset("hero-wide"),
    "/src/assets/hero-narrow.png": await resolveAsset("hero-narrow"),
    "/src/assets/mockups/iphone-case-front.png": await resolveAsset("iphone-case-front"),
    "/src/assets/mockups/iphone-case-angled.png": await resolveAsset("iphone-case-angled"),
    "/src/assets/mockups/samsung-case-front.png": await resolveAsset("samsung-case-front"),
    "/src/assets/mockups/samsung-case-angled.png": await resolveAsset("samsung-case-angled"),
  };
  const vite = await createServer({
    appType: "custom",
    root: process.cwd(),
    server: { middlewareMode: true },
    logLevel: "error",
    mode: "production",
  });

  try {
    const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");
    const { seoRoutes } = await vite.ssrLoadModule("/src/data/seoRoutes.ts");
    const routes = [...baseRoutes, ...seoRoutes];

    for (const route of routes) {
      const { appHtml } = await render(route.path);
      let html = injectAppHtml(template, appHtml);
      html = replaceAssetUrls(html, assetMap);
      html = applySeo(html, route);

      const outputPath =
        route.path === "/"
          ? templatePath
          : path.resolve("dist", route.path.slice(1), "index.html");

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, html, "utf8");
    }

    await fs.writeFile(path.resolve("dist", "sitemap.xml"), buildSitemap(routes), "utf8");
  } finally {
    await vite.close();
  }
};

await renderRoutes();
