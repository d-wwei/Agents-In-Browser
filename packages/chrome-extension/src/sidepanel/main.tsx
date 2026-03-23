import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app.css";
import { useSettingsStore } from "./store/settingsStore";

function applyTheme(theme: "dark" | "light" | "system") {
  const prefersDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", prefersDark);
}

// Apply dark immediately before React renders to avoid FOUC
applyTheme("dark");

// Watch for any store change and re-apply theme when it differs
let prevTheme: string | undefined;
useSettingsStore.subscribe((state) => {
  if (state.theme !== prevTheme) {
    prevTheme = state.theme;
    applyTheme(state.theme);
  }
});

// Listen for system color scheme changes
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const theme = useSettingsStore.getState().theme;
    if (theme === "system") applyTheme("system");
  });

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
