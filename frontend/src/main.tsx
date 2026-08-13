import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./app/App";
import { requireApiBaseUrl } from "./api/env";
import "./styles/global.css";

requireApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Root element #root is missing");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
