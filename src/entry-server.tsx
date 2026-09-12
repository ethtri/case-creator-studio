import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import AppRoutes from "./AppRoutes";
import { AppShell } from "./App";
import { AnalyticsConsentBanner } from "./components/AnalyticsConsentBanner";

const PRERENDER_TIMEOUT_MS = 15_000;

export const render = (url: string) =>
  new Promise<{ appHtml: string }>((resolve, reject) => {
    const output = new PassThrough();
    let appHtml = "";
    let settled = false;
    let renderError: unknown;

    const settleWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      appHtml += chunk;
    });
    output.on("error", settleWithError);
    output.on("end", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ appHtml });
    });

    const timeout = setTimeout(() => {
      abort();
      settleWithError(
        new Error(`Timed out while prerendering ${url}.`)
      );
    }, PRERENDER_TIMEOUT_MS);

    const { pipe, abort } = renderToPipeableStream(
      <AppShell>
        <StaticRouter location={url}>
          <AppRoutes />
          <AnalyticsConsentBanner />
        </StaticRouter>
      </AppShell>,
      {
        onAllReady() {
          if (renderError) {
            settleWithError(renderError);
            abort();
            return;
          }
          pipe(output);
        },
        onShellError: settleWithError,
        onError(error) {
          renderError ??= error;
        },
      }
    );
  });
