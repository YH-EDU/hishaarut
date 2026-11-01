import { StrictMode } from "react";
import { registerSW } from "virtual:pwa-register";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { setApi } from "./api";
import { supabaseApi } from "./api/supabaseApi";
import { AuthProvider } from "./auth";
import App from "./App";
import "./index.css";
import "@fontsource/rubik/hebrew-400.css";
import "@fontsource/rubik/hebrew-500.css";
import "@fontsource/rubik/hebrew-700.css";
import "@fontsource/rubik/latin-400.css";
import "@fontsource/rubik/latin-500.css";
import "@fontsource/rubik/latin-700.css";

const rawBase = import.meta.env.BASE_URL;
const basename = rawBase === "/" ? undefined : rawBase.replace(/\/$/, "");

async function boot() {
  if (import.meta.env.DEV && import.meta.env.VITE_DEMO === "1") {
    const { demoApi } = await import("./demo/demoApi");
    setApi(demoApi);
  } else {
    setApi(supabaseApi);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

registerSW({ immediate: true });
void boot();
