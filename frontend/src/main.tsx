import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { requireApiBaseUrl } from "./api/env";

requireApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Root element #root is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
