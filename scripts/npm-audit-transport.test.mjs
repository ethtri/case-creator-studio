import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import http, { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createAuditProxy,
  decodeAuditJson,
  isRawGzipAuditFailure,
  listenOnLoopback,
} from "./run-npm-audit.mjs";

const auditPayload = {
  "brace-expansion": [
    {
      id: 1124334,
      url: "https://github.com/advisories/GHSA-example",
      title: "Bounded fixture advisory",
      severity: "high",
      vulnerable_versions: "<=2.1.2",
    },
  ],
};

const auditJson = Buffer.from(JSON.stringify(auditPayload));
const auditRunner = fileURLToPath(
  new URL("./run-npm-audit.mjs", import.meta.url),
);

const closeServer = (server) =>
  new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
      } else {
        resolveClose();
      }
    });
  });

const startMockRegistry = async (handler) => {
  const server = createServer(handler);
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    origin: new URL(`http://127.0.0.1:${address.port}/`),
    server,
  };
};

const postAudit = (registry) =>
  new Promise((resolveResponse, rejectResponse) => {
    const request = http.request(
      new URL("/-/npm/v1/security/advisories/bulk", registry),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2",
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolveResponse({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on("error", rejectResponse);
    request.end("{}");
  });

test("decodes raw gzip audit JSON only when the encoding header is missing", () => {
  const decoded = decodeAuditJson(gzipSync(auditJson));

  assert.equal(decoded.correctedMissingEncoding, true);
  assert.deepEqual(JSON.parse(decoded.body.toString("utf8")), auditPayload);
});

test("accepts plain and correctly labelled gzip audit JSON", () => {
  const plain = decodeAuditJson(auditJson);
  const labelled = decodeAuditJson(gzipSync(auditJson), "gzip");

  assert.equal(plain.correctedMissingEncoding, false);
  assert.equal(labelled.correctedMissingEncoding, false);
  assert.deepEqual(JSON.parse(plain.body.toString("utf8")), auditPayload);
  assert.deepEqual(JSON.parse(labelled.body.toString("utf8")), auditPayload);
});

test("fails closed for invalid JSON, unknown encodings, and ambiguous schemas", () => {
  assert.throws(() => decodeAuditJson(Buffer.from("<html>error</html>")));
  assert.throws(() => decodeAuditJson(auditJson, "compress"));
  assert.throws(() => decodeAuditJson(Buffer.from("[]")));
  assert.throws(() =>
    decodeAuditJson(
      Buffer.from(
        JSON.stringify({
          package: [{ severity: "high" }],
        }),
      ),
    ),
  );
});

test("recognizes only the proven npm raw-gzip parser failure", () => {
  const gzipFailure = {
    exitCode: 1,
    stdout: "undefined\n",
    stderr:
      "npm warn audit invalid json response body at https://registry.npmjs.org/-/npm/v1/security/advisories/bulk reason: Unexpected token '^_' is not valid JSON\nnpm error audit endpoint returned an error\n",
  };

  assert.equal(isRawGzipAuditFailure(gzipFailure), true);
  assert.equal(
    isRawGzipAuditFailure({
      ...gzipFailure,
      stderr: "npm error Invalid package lock file",
    }),
    false,
  );
  assert.equal(isRawGzipAuditFailure({ ...gzipFailure, exitCode: 0 }), false);
});

test("propagates a real npm vulnerability exit without invoking the decoder", () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "snapcase-audit-vuln-"));
  const fakeNpmCli = join(fixtureDirectory, "npm-cli.js");
  writeFileSync(
    fakeNpmCli,
    'process.stdout.write("# npm audit report\\nfixture vulnerability\\n"); process.exitCode = 1;\n',
  );

  try {
    const result = spawnSync(
      process.execPath,
      [auditRunner, "--audit-level=high"],
      {
        cwd: fixtureDirectory,
        encoding: "utf8",
        env: { ...process.env, npm_execpath: fakeNpmCli },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /fixture vulnerability/);
    assert.doesNotMatch(result.stderr, /loopback decoder/);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("an invalid package lock fails before any transport fallback", () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "snapcase-audit-lock-"));
  writeFileSync(
    join(fixtureDirectory, "package.json"),
    JSON.stringify({ name: "invalid-lock-fixture", version: "1.0.0" }),
  );
  writeFileSync(join(fixtureDirectory, "package-lock.json"), "{invalid json");

  try {
    const result = spawnSync(
      process.execPath,
      [auditRunner, "--audit-level=high"],
      {
        cwd: fixtureDirectory,
        encoding: "utf8",
        env: process.env,
      },
    );

    assert.equal(result.status, 1);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /EJSONPARSE|ENOLOCK|lockfile/,
    );
    assert.doesNotMatch(result.stderr, /loopback decoder/);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("retries one malformed bulk response and returns validated JSON", async () => {
  let requests = 0;
  const mock = await startMockRegistry((_request, response) => {
    requests += 1;
    const body = requests === 1 ? Buffer.from("not json") : gzipSync(auditJson);
    response.writeHead(200, { "content-length": String(body.length) });
    response.end(body);
  });
  let corrections = 0;
  const proxy = createAuditProxy({
    upstreamOrigin: mock.origin,
    maximumAttempts: 2,
    backoffMs: 1,
    onCorrection: () => {
      corrections += 1;
    },
  });

  try {
    const registry = await listenOnLoopback(proxy);
    const response = await postAudit(registry);

    assert.equal(response.statusCode, 200);
    assert.equal(requests, 2);
    assert.equal(corrections, 1);
    assert.equal(response.headers["content-encoding"], undefined);
    assert.deepEqual(JSON.parse(response.body.toString("utf8")), auditPayload);
  } finally {
    await closeServer(proxy);
    await closeServer(mock.server);
  }
});

test("repeated malformed responses exhaust the bound and fail closed", async () => {
  let requests = 0;
  const mock = await startMockRegistry((_request, response) => {
    requests += 1;
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("still not json");
  });
  const proxy = createAuditProxy({
    upstreamOrigin: mock.origin,
    maximumAttempts: 2,
    backoffMs: 1,
  });

  try {
    const registry = await listenOnLoopback(proxy);
    const response = await postAudit(registry);
    const failure = JSON.parse(response.body.toString("utf8"));

    assert.equal(response.statusCode, 502);
    assert.equal(requests, 2);
    assert.equal(failure.error, "npm audit transport adapter failed closed");
  } finally {
    await closeServer(proxy);
    await closeServer(mock.server);
  }
});
