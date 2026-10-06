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
import "./styles/components/datepicker.css";
import "./styles/components/auth.css";
import "./styles/components/settings.css";
import "./styles/components/bonus.css";
import "./styles/components/salary.css";
import "./styles/components/engineering.css";
import "./styles/components/billsheet.css";
import "./styles/components/admin-console.css";

import App from "./App";

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
