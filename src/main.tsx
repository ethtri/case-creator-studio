import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import { preloadInitialRoute } from "./route-loaders";
import "./index.css";

const root = document.getElementById("root");

const renderApp = async () => {
  if (root?.hasChildNodes()) {
    await preloadInitialRoute(window.location.pathname);
    hydrateRoot(root, <App />);
  } else if (root) {
    createRoot(root).render(<App />);
  }
};

void renderApp();
