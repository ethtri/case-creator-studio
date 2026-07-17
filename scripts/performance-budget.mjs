import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const distDir = path.resolve("dist");
const manifestPath = path.join(distDir, ".vite", "manifest.json");
const homepagePath = path.join(distDir, "index.html");
const maxInitialTransferBytes = 1_500_000;
const maxInitialJavaScriptBytes = 350_000;
const failures = [];

const fail = (message) => {
  failures.push(message);
};

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const manifest = readJson(manifestPath);
const homepage = fs.readFileSync(homepagePath, "utf8");

const findManifestEntry = (source) => {
  const match = Object.entries(manifest).find(
    ([key, value]) => key === source || value.src === source
  );

  if (!match) {
    throw new Error(`Missing Vite manifest entry for ${source}.`);
  }

  return match;
};

const collectStaticFiles = (entryKey) => {
  const files = new Set();
  const visited = new Set();

  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);

    const entry = manifest[key];
    if (!entry) {
      throw new Error(`Missing imported Vite manifest chunk ${key}.`);
    }

    files.add(entry.file);
    entry.css?.forEach((file) => files.add(file));
    entry.imports?.forEach(visit);
  };

  visit(entryKey);
  return files;
};

const [, appEntry] = findManifestEntry("index.html");
const [appEntryKey] = findManifestEntry("index.html");
const [homepageEntryKey, homepageEntry] =
  findManifestEntry("src/pages/Index.tsx");
const [, editorEntry] = findManifestEntry("src/pages/DesignEditorEDM.tsx");

if (!appEntry.isEntry) {
  fail("The index.html bundle is not marked as the application entry.");
}

if (homepageEntry.file === editorEntry.file) {
  fail("Homepage and editor code are still emitted in the same route chunk.");
}

const initialFiles = new Set([
  ...collectStaticFiles(appEntryKey),
  ...collectStaticFiles(homepageEntryKey),
]);

const initialJavaScriptBytes = [...initialFiles]
  .filter((file) => file.endsWith(".js"))
  .reduce(
    (total, file) =>
      total + gzipSync(fs.readFileSync(path.join(distDir, file))).byteLength,
    0
  );

if (initialJavaScriptBytes > maxInitialJavaScriptBytes) {
  fail(
    `Initial homepage JavaScript is ${initialJavaScriptBytes} bytes compressed; budget is ${maxInitialJavaScriptBytes}.`
  );
}

const initialStylesheetBytes = [...initialFiles]
  .filter((file) => file.endsWith(".css"))
  .reduce(
    (total, file) =>
      total + gzipSync(fs.readFileSync(path.join(distDir, file))).byteLength,
    0
  );

const assetFiles = fs.readdirSync(path.join(distDir, "assets"));
const largestAsset = (pattern) => {
  const candidates = assetFiles.filter((file) => pattern.test(file));
  if (candidates.length === 0) {
    throw new Error(`Missing built asset matching ${pattern}.`);
  }

  return Math.max(
    ...candidates.map((file) =>
      fs.statSync(path.join(distDir, "assets", file)).size
    )
  );
};

const desktopHeroBytes = largestAsset(/^hero-wide-\d+-.*\.avif$/);
const mobileHeroBytes = largestAsset(/^hero-narrow-\d+-.*\.avif$/);
const localFontBytes = fs
  .readdirSync(path.join(distDir, "fonts"))
  .filter((file) => file.endsWith(".woff2"))
  .reduce(
    (total, file) =>
      total + fs.statSync(path.join(distDir, "fonts", file)).size,
    0
  );
const faviconBytes = fs.statSync(
  path.join(distDir, "favicon-96.png")
).size;
const sharedRouteBytes =
  initialJavaScriptBytes +
  initialStylesheetBytes +
  localFontBytes +
  faviconBytes;
const estimatedDesktopTransferBytes =
  sharedRouteBytes + desktopHeroBytes;
const estimatedMobileTransferBytes =
  sharedRouteBytes + mobileHeroBytes;

if (estimatedDesktopTransferBytes > maxInitialTransferBytes) {
  fail(
    `Estimated desktop homepage transfer is ${estimatedDesktopTransferBytes} bytes; budget is ${maxInitialTransferBytes}.`
  );
}

if (estimatedMobileTransferBytes > maxInitialTransferBytes) {
  fail(
    `Estimated mobile homepage transfer is ${estimatedMobileTransferBytes} bytes; budget is ${maxInitialTransferBytes}.`
  );
}

if (!homepage.includes("<picture")) {
  fail("Prerendered homepage is missing a responsive picture element.");
}

if (!homepage.includes('type="image/avif"')) {
  fail("Prerendered homepage is missing an AVIF hero source.");
}

if (!homepage.includes('media="(min-width: 768px)"')) {
  fail("Prerendered homepage is missing the desktop hero media condition.");
}

if (
  homepage.includes("hero-wide.png") ||
  homepage.includes("hero-narrow.png")
) {
  fail("Prerendered homepage still references a legacy PNG hero.");
}

if (homepage.includes("fonts.googleapis.com/css2?family=Inter")) {
  fail("Prerendered homepage still depends on render-blocking Google Fonts CSS.");
}

const initialSource = [...initialFiles]
  .filter((file) => file.endsWith(".js"))
  .map((file) => fs.readFileSync(path.join(distDir, file), "utf8"))
  .join("\n");

if (
  initialSource.includes("snapcase-editor-fonts") ||
  initialSource.includes("fonts.googleapis.com/css2?family=Anton")
) {
  fail("Editor-only font loading code leaked into the homepage route.");
}

const toKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

console.log("Homepage performance budget");
console.log(`- compressed route JavaScript: ${toKiB(initialJavaScriptBytes)}`);
console.log(`- compressed route CSS: ${toKiB(initialStylesheetBytes)}`);
console.log(`- self-hosted brand fonts: ${toKiB(localFontBytes)}`);
console.log(`- favicon: ${toKiB(faviconBytes)}`);
console.log(`- largest desktop AVIF candidate: ${toKiB(desktopHeroBytes)}`);
console.log(`- largest mobile AVIF candidate: ${toKiB(mobileHeroBytes)}`);
console.log(
  `- estimated desktop local transfer: ${toKiB(estimatedDesktopTransferBytes)}`
);
console.log(
  `- estimated mobile local transfer: ${toKiB(estimatedMobileTransferBytes)}`
);

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("- responsive media, route splitting, and transfer budgets passed");
}
