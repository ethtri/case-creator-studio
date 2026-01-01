import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import AppRoutes from "./AppRoutes";
import { AppShell } from "./App";

export const render = (url: string) => {
  const appHtml = renderToString(
    <AppShell>
      <StaticRouter location={url}>
        <AppRoutes />
      </StaticRouter>
    </AppShell>
  );

  return { appHtml };
};
