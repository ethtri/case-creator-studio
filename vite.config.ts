import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const vendorChunk = (id: string) => {
  const normalizedId = id.replaceAll("\\", "/");
  const dependencyPath = normalizedId.split("/node_modules/")[1];

  if (!dependencyPath) return undefined;

  if (/^(react|react-dom|scheduler)(?:\/|$)/.test(dependencyPath)) {
    return "react-runtime";
  }

  if (
    /^(react-router|react-router-dom|@remix-run\/router)(?:\/|$)/.test(
      dependencyPath,
    )
  ) {
    return "routing";
  }

  if (/^(@supabase\/|@tanstack\/)/.test(dependencyPath)) {
    return "data-services";
  }

  return undefined;
};

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
});
