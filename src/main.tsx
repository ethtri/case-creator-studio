import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root");

if (root?.hasChildNodes()) {
  hydrateRoot(root, <App />);
} else if (root) {
  createRoot(root).render(<App />);
}
