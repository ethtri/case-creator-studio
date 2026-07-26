#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http, { createServer } from "node:http";
import https from "node:https";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

const OFFICIAL_REGISTRY = new URL("https://registry.npmjs.org/");
const BULK_AUDIT_PATH = "/-/npm/v1/security/advisories/bulk";
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 250;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const VALID_SEVERITIES = new Set([
  "info",
  "low",
  "moderate",
  "high",
  "critical",
]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const isGzip = (body) =>
  body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b;

const headerValue = (value) =>
  Array.isArray(value) ? value.join(",") : (value ?? "");

const sanitizeHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) =>
        value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase()),
    ),
  );

const collectStream = (stream, maximumBytes) =>
  new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let totalBytes = 0;

    stream.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maximumBytes) {
        rejectBody(
          new Error(`response exceeded the ${maximumBytes}-byte safety limit`),
        );
        stream.destroy();
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolveBody(Buffer.concat(chunks)));
    stream.on("error", rejectBody);
  });

const validateAuditPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("bulk advisory response must be a JSON object");
  }

  for (const [packageName, advisories] of Object.entries(payload)) {
    if (!packageName || !Array.isArray(advisories)) {
      throw new Error("bulk advisory response has an ambiguous package entry");
    }

    for (const advisory of advisories) {
      if (
        !advisory ||
        typeof advisory !== "object" ||
        Array.isArray(advisory)
      ) {
        throw new Error("bulk advisory response has an invalid advisory entry");
      }
      if (
        !["number", "string"].includes(typeof advisory.id) ||
        typeof advisory.url !== "string" ||
        typeof advisory.title !== "string" ||
        typeof advisory.vulnerable_versions !== "string" ||
        !VALID_SEVERITIES.has(String(advisory.severity).toLowerCase())
      ) {
        throw new Error(
          "bulk advisory response has an unknown advisory schema",
        );
      }
    }
  }

  return payload;
};

export const decodeAuditJson = (body, contentEncoding = "") => {
  let decoded = Buffer.from(body);
  const encodings = headerValue(contentEncoding)
    .split(",")
    .map((encoding) => encoding.trim().toLowerCase())
    .filter((encoding) => encoding && encoding !== "identity");
  let correctedMissingEncoding = false;

  if (encodings.length === 0 && isGzip(decoded)) {
    decoded = gunzipSync(decoded);
    correctedMissingEncoding = true;
  } else {
    for (const encoding of encodings.reverse()) {
      if (encoding === "gzip") {
        decoded = gunzipSync(decoded);
      } else if (encoding === "deflate") {
        decoded = inflateSync(decoded);
      } else if (encoding === "br") {
        decoded = brotliDecompressSync(decoded);
      } else {
        throw new Error(`unsupported audit response encoding: ${encoding}`);
      }
    }
  }

  if (isGzip(decoded)) {
    throw new Error("bulk advisory response has ambiguous nested compression");
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  const payload = validateAuditPayload(JSON.parse(text));

  return {
    body: Buffer.from(JSON.stringify(payload)),
    correctedMissingEncoding,
  };
};

export const isRawGzipAuditFailure = ({ exitCode, stdout, stderr }) => {
  if (exitCode === 0) {
    return false;
  }

  const output = `${stdout}\n${stderr}`;
  return (
    output.includes(
      `invalid json response body at ${OFFICIAL_REGISTRY.origin}${BULK_AUDIT_PATH}`,
    ) &&
    output.includes("Unexpected token '^_'") &&
    output.includes("audit endpoint returned an error")
  );
};

const forwardOnce = async ({ upstreamOrigin, method, path, headers, body }) => {
  const requestFunction =
    upstreamOrigin.protocol === "https:" ? https.request : http.request;
  const upstreamHeaders = sanitizeHeaders(headers);
  upstreamHeaders.host = upstreamOrigin.host;
  upstreamHeaders.connection = "close";
  if (body.length > 0) {
    upstreamHeaders["content-length"] = String(body.length);
  } else {
    delete upstreamHeaders["content-length"];
  }

  return new Promise((resolveResponse, rejectResponse) => {
    const upstreamRequest = requestFunction(
      {
        protocol: upstreamOrigin.protocol,
        hostname: upstreamOrigin.hostname,
        port: upstreamOrigin.port || undefined,
        method,
        path,
        headers: upstreamHeaders,
      },
      async (upstreamResponse) => {
        try {
          const responseBody = await collectStream(
            upstreamResponse,
            MAX_RESPONSE_BYTES,
          );
          resolveResponse({
            statusCode: upstreamResponse.statusCode ?? 502,
            headers: upstreamResponse.headers,
            body: responseBody,
          });
        } catch (error) {
          rejectResponse(error);
        }
      },
    );

    upstreamRequest.on("error", rejectResponse);
    upstreamRequest.end(body);
  });
};

const normalizeBulkResponse = (response) => {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    return { ...response, correctedMissingEncoding: false };
  }

  const decoded = decodeAuditJson(
    response.body,
    response.headers["content-encoding"],
  );
  const headers = sanitizeHeaders(response.headers);
  delete headers["content-encoding"];
  delete headers["content-length"];
  delete headers.etag;
  headers["content-type"] = "application/json";
  headers["content-length"] = String(decoded.body.length);

  return {
    ...response,
    headers,
    body: decoded.body,
    correctedMissingEncoding: decoded.correctedMissingEncoding,
  };
};

const forwardWithRetry = async ({
  upstreamOrigin,
  method,
  path,
  headers,
  body,
  maximumAttempts,
  backoffMs,
}) => {
  let lastResponse;
  let lastError;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await forwardOnce({
        upstreamOrigin,
        method,
        path,
        headers,
        body,
      });
      lastResponse =
        new URL(path, upstreamOrigin).pathname === BULK_AUDIT_PATH
          ? normalizeBulkResponse(response)
          : response;

      if (
        !RETRYABLE_STATUS_CODES.has(lastResponse.statusCode) ||
        attempt === maximumAttempts
      ) {
        return lastResponse;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maximumAttempts) {
        throw error;
      }
    }

    await delay(backoffMs * 2 ** (attempt - 1));
  }

  if (lastResponse) {
    return lastResponse;
  }
  throw lastError ?? new Error("npm Registry request failed");
};

const writeFailure = (response, error) => {
  const body = Buffer.from(
    JSON.stringify({
      error: "npm audit transport adapter failed closed",
      reason: error instanceof Error ? error.message : "unknown failure",
    }),
  );
  response.writeHead(502, {
    "content-type": "application/json",
    "content-length": String(body.length),
  });
  response.end(body);
};

export const createAuditProxy = ({
  upstreamOrigin = OFFICIAL_REGISTRY,
  maximumAttempts = DEFAULT_MAX_ATTEMPTS,
  backoffMs = DEFAULT_BACKOFF_MS,
  onCorrection = () => {},
} = {}) => {
  if (
    !Number.isInteger(maximumAttempts) ||
    maximumAttempts < 1 ||
    maximumAttempts > 4
  ) {
    throw new Error("maximumAttempts must be an integer between 1 and 4");
  }

  return createServer(async (request, response) => {
    try {
      if (!["GET", "HEAD", "POST"].includes(request.method ?? "")) {
        response.writeHead(405, { allow: "GET, HEAD, POST" });
        response.end();
        return;
      }

      const requestBody = await collectStream(request, MAX_REQUEST_BYTES);
      const upstreamResponse = await forwardWithRetry({
        upstreamOrigin,
        method: request.method,
        path: request.url ?? "/",
        headers: request.headers,
        body: requestBody,
        maximumAttempts,
        backoffMs,
      });

      if (upstreamResponse.correctedMissingEncoding) {
        onCorrection();
      }

      const responseHeaders = sanitizeHeaders(upstreamResponse.headers);
      delete responseHeaders["content-length"];
      responseHeaders["content-length"] = String(upstreamResponse.body.length);
      response.writeHead(upstreamResponse.statusCode, responseHeaders);
      response.end(upstreamResponse.body);
    } catch (error) {
      writeFailure(response, error);
    }
  });
};

export const listenOnLoopback = async (server) => {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (
    !address ||
    typeof address === "string" ||
    address.address !== "127.0.0.1"
  ) {
    await new Promise((resolveClose) => server.close(resolveClose));
    throw new Error(
      "audit adapter did not bind to the IPv4 loopback interface",
    );
  }
  return `http://127.0.0.1:${address.port}/`;
};

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

const resolveNpmCli = () => {
  const configuredPath = process.env.npm_execpath;
  if (
    configuredPath &&
    basename(configuredPath).toLowerCase() === "npm-cli.js" &&
    existsSync(configuredPath)
  ) {
    return configuredPath;
  }

  const besideNode = resolve(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (existsSync(besideNode)) {
    return besideNode;
  }

  throw new Error("could not locate npm-cli.js; run this command through npm");
};

const validateAuditArguments = (argumentsToValidate) => {
  const allowed = new Set([
    "--omit=dev",
    "--audit-level=info",
    "--audit-level=low",
    "--audit-level=moderate",
    "--audit-level=high",
    "--audit-level=critical",
  ]);
  for (const argument of argumentsToValidate) {
    if (!allowed.has(argument)) {
      throw new Error(`unsupported audit argument: ${argument}`);
    }
  }
};

const runNpm = ({ npmCli, auditArguments, registry, captureOutput }) =>
  new Promise((resolveRun) => {
    const argumentsForNpm = [npmCli, "audit", ...auditArguments];
    if (registry) {
      argumentsForNpm.push(`--registry=${registry}`);
    }

    const child = spawn(process.execPath, argumentsForNpm, {
      cwd: process.cwd(),
      env: process.env,
      stdio: captureOutput
        ? ["ignore", "pipe", "pipe"]
        : ["inherit", "inherit", "inherit"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let capturedBytes = 0;
    let exceededCaptureLimit = false;

    const capture = (destination) => (chunk) => {
      capturedBytes += chunk.length;
      if (capturedBytes > MAX_CAPTURE_BYTES) {
        exceededCaptureLimit = true;
        child.kill();
        return;
      }
      destination.push(chunk);
    };

    if (captureOutput) {
      child.stdout.on("data", capture(stdoutChunks));
      child.stderr.on("data", capture(stderrChunks));
    }

    child.on("error", (error) => {
      resolveRun({
        exitCode: 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `${Buffer.concat(stderrChunks).toString("utf8")}\n${error.message}`,
      });
    });
    child.on("exit", (exitCode, signal) => {
      const captureError = exceededCaptureLimit
        ? `npm audit output exceeded the ${MAX_CAPTURE_BYTES}-byte safety limit`
        : signal
          ? `npm audit terminated by signal ${signal}`
          : "";
      resolveRun({
        exitCode: exceededCaptureLimit || signal ? 1 : (exitCode ?? 1),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `${Buffer.concat(stderrChunks).toString("utf8")}${
          captureError ? `\n${captureError}\n` : ""
        }`,
      });
    });
  });

const replay = ({ stdout, stderr }) => {
  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
};

export const runAudit = async (auditArguments) => {
  validateAuditArguments(auditArguments);
  const npmCli = resolveNpmCli();
  const directResult = await runNpm({
    npmCli,
    auditArguments,
    captureOutput: true,
  });

  if (!isRawGzipAuditFailure(directResult)) {
    replay(directResult);
    return directResult.exitCode;
  }

  process.stderr.write(
    "npm audit received gzip JSON without Content-Encoding; retrying through the bounded loopback decoder.\n",
  );
  let correctionReported = false;
  const server = createAuditProxy({
    onCorrection: () => {
      if (!correctionReported) {
        correctionReported = true;
        process.stderr.write(
          "npm audit transport was decoded and schema-validated; npm remains authoritative for the result.\n",
        );
      }
    },
  });

  try {
    const registry = await listenOnLoopback(server);
    const fallbackResult = await runNpm({
      npmCli,
      auditArguments,
      registry,
      captureOutput: false,
    });
    return fallbackResult.exitCode;
  } finally {
    if (server.listening) {
      await closeServer(server);
    }
  }
};

const main = async () => {
  try {
    return await runAudit(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `npm audit transport adapter failed closed: ${
        error instanceof Error ? error.message : "unknown failure"
      }\n`,
    );
    return 1;
  }
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  process.exitCode = await main();
}
