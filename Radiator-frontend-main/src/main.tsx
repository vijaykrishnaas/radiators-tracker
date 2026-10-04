import { createRoot } from "react-dom/client";

// Style order (spec §15.2): Bootstrap → fonts → tokens → Bootstrap bridge → components.
import "bootstrap/dist/css/bootstrap.min.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/bootstrap-bridge.css";
import "./styles/components/shell.css";
import "./styles/components/ui.css";

import App from "./App";

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
