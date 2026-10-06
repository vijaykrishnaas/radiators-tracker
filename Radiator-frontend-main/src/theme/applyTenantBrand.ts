/**
 * applyTenantBrand — derives the full TailAdmin-style brand scale (25–950) and
 * contrast-safe companions from the tenant's two colours, and writes them as
 * CSS custom properties on <html>.
 *
 * Call it wherever the app currently sets `--primary` / `--accentColor`
 * (after login, on app boot from stored settings, on the branded login page,
 * and after "Save All Settings" changes Branding).
 *
 * Why JS and not CSS color-mix(): the contrast guard needs real luminance math,
 * and older Android tablet WebViews on the shop floor may lack color-mix().
 *
 * Output variables (all on document.documentElement):
 *   --brand-25 … --brand-950   tints/shades of the tenant primary
 *   --brand-500                 = tenant primary (exactly)
 *   --brand-solid               background for solid brand surfaces (primary buttons, active pills,
 *                               selected checkbox). = --brand-500 unless no text colour reaches 4.5:1
 *                               on it — then the first darker step where white text does.
 *   --brand-hover               hover/active background for --brand-solid
 *   --on-brand                  text/icon colour on --brand-solid (white or gray-900)
 *   --brand-text                brand colour safe for text/icons on white & brand-50 (≥ 4.5:1)
 *   --brand-solid-border        border for solid brand buttons (transparent unless primary is very light)
 *   --focus-ring-color          colour for focus-ring box-shadows (named so it can't collide with a
 *                               legacy `--focus-ring` that holds a full box-shadow value)
 *   --accent (exact), --accent-solid, --on-accent, --accent-hover
 *   --primary, --accentColor    kept for backward compatibility (PDF code, legacy CSS)
 */

export const DEFAULT_PRIMARY = "#12467A"; // current in-app fallback; see spec §2.3 (open question: unify login fallback)
export const DEFAULT_ACCENT = "#F47F6B";

const WHITE = "#FFFFFF";
const GRAY_900 = "#101828";
/** Dark theme card surface (--white in theme.css dark block). */
export const DARK_SURFACE = "#161E2C";

export type ThemeMode = "light" | "dark";

type RGB = [number, number, number];

export function parseHex(input: string | null | undefined): RGB | null {
  if (!input) return null;
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = h.split("").map((c) => c + c).join(""); // #RGB / #RGBA
  if (/^[0-9a-f]{8}$/i.test(h)) h = h.slice(0, 6); // #RRGGBBAA from some pickers: alpha is ignored
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

export function toHex([r, g, b]: RGB): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** Mix `weight` (0–1) of colour a into colour b, in sRGB. */
function mix(a: RGB, b: RGB, weight: number): RGB {
  return [0, 1, 2].map((i) => a[i] * weight + b[i] * (1 - weight)) as RGB;
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Weight of the primary colour in each step. 25–400 mix with white, 600–950 mix with black.
const TINTS: Record<number, number> = { 25: 0.05, 50: 0.1, 100: 0.16, 200: 0.28, 300: 0.45, 400: 0.72 };
const SHADES: Record<number, number> = { 600: 0.12, 700: 0.26, 800: 0.4, 900: 0.54, 950: 0.7 };

export interface BrandTokens {
  scale: Record<number, string>;
  solid: string;
  hover: string;
  onBrand: string;
  brandText: string;
  solidBorder: string;
  focusRing: string;
  /** Chart series colours (pair: main + comparison). Light: brand-500 / brand-300. Dark: lifted so bars, lines and
   *  loaders stay visible on the dark card (the raw primary is often too dark there). */
  chart: string;
  chart2: string;
}

export function buildBrand(primaryHex: string | null | undefined, mode: ThemeMode = "light"): BrandTokens {
    const light = buildLightBrand(primaryHex);
    return mode === "dark" ? toDark(primaryHex, light) : light;
}

// Dark theme: tints (25–400) blend the primary into the dark card surface so "brand-50" stays a subtle background,
// and 600–950 blend toward white so they read as lighter steps. Solid buttons keep the light-mode surface and text
// (already contrast-checked). Brand text must reach 4.5:1 on the dark surface and on dark brand-50.
function toDark(primaryHex: string | null | undefined, light: BrandTokens): BrandTokens {
    const p = parseHex(primaryHex) ?? (parseHex(DEFAULT_PRIMARY) as RGB);
    const surface = parseHex(DARK_SURFACE) as RGB;
    const white = parseHex(WHITE) as RGB;
    const DARK_TINTS: Record<number, number> = { 25: 0.06, 50: 0.12, 100: 0.2, 200: 0.32, 300: 0.5, 400: 0.75 };
    const DARK_LIFTS: Record<number, number> = { 600: 0.15, 700: 0.3, 800: 0.45, 900: 0.6, 950: 0.75 };
    const rgb: Record<number, RGB> = { 500: p };
    for (const [step, w] of Object.entries(DARK_TINTS)) rgb[+step] = mix(p, surface, w);
    for (const [step, w] of Object.entries(DARK_LIFTS)) rgb[+step] = mix(white, p, w);
    const scale: Record<number, string> = {};
    for (const step of Object.keys(rgb).map(Number).sort((a, b) => a - b)) {
        scale[step] = toHex(rgb[step]);
        rgb[step] = parseHex(scale[step]) as RGB;
    }
    const candidates: RGB[] = [p, ...[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((w) => parseHex(toHex(mix(white, p, w))) as RGB)];
    const text = candidates.find((c) => contrast(c, surface) >= 4.5 && contrast(c, rgb[50]) >= 4.5) ?? white;
    const brandText = toHex(text);
    // 300/400 are used for focus borders, hover borders and the second chart series: base them on the readable brand
    // text colour so they stay visible on the dark card instead of sinking into it.
    scale[300] = toHex(mix(text, surface, 0.6));
    scale[400] = toHex(mix(text, surface, 0.8));
    const solidRgb = parseHex(light.solid) as RGB;
    const solidBorder = contrast(solidRgb, surface) < 3 ? brandText : "transparent";
    const focusRing = `rgba(${text.map(Math.round).join(", ")}, 0.35)`;
    return { ...light, scale, brandText, solidBorder, focusRing, chart: brandText, chart2: scale[300] };
}

function buildLightBrand(primaryHex: string | null | undefined): BrandTokens {
  const p = parseHex(primaryHex) ?? (parseHex(DEFAULT_PRIMARY) as RGB);
  const white = parseHex(WHITE) as RGB;
  const black: RGB = [0, 0, 0];
  const gray900 = parseHex(GRAY_900) as RGB;

  const rgbScale: Record<number, RGB> = { 500: p };
  for (const [step, w] of Object.entries(TINTS)) rgbScale[+step] = mix(p, white, w);
  for (const [step, w] of Object.entries(SHADES)) rgbScale[+step] = mix(black, p, w);

  const scale: Record<number, string> = {};
  for (const step of Object.keys(rgbScale).map(Number).sort((a, b) => a - b)) {
    scale[step] = toHex(rgbScale[step]);
    rgbScale[step] = parseHex(scale[step]) as RGB; // measure contrast on the rounded colour that actually ships
  }

  // Solid surface + text on it. Prefer the exact primary with white or gray-900 text; if neither
  // reaches 4.5:1 (mid-tone reds/oranges/greens), darken until white text passes.
  const best = (c: RGB) => (contrast(c, white) >= contrast(c, gray900) ? WHITE : GRAY_900);
  let solidStep = 500;
  let onBrand = best(p);
  if (contrast(p, parseHex(onBrand) as RGB) < 4.5) {
    solidStep = [600, 700, 800, 900, 950].find((s) => contrast(rgbScale[s], white) >= 4.5) ?? 950;
    onBrand = WHITE;
  }
  const solid = scale[solidStep];

  // Brand as text/icon on white and on brand-50 (active menu item): first step reaching 4.5:1 on both.
  const textSteps = [500, 600, 700, 800, 900, 950];
  const brandTextStep =
    textSteps.find((s) => contrast(rgbScale[s], white) >= 4.5 && contrast(rgbScale[s], rgbScale[50]) >= 4.5) ?? 950;
  const brandText = scale[brandTextStep];

  // Hover: one step darker than the solid surface if the text on it still reaches 4.5:1 there;
  // otherwise (dark text on a mid-tone, or an already near-black surface) one step lighter.
  const darker: Record<number, number> = { 500: 600, 600: 700, 700: 800, 800: 900, 900: 950, 950: 950 };
  const lighter: Record<number, number> = { 500: 400, 600: 500, 700: 600, 800: 700, 900: 800, 950: 900 };
  const onRgb = parseHex(onBrand) as RGB;
  const darkStep = darker[solidStep];
  const hoverStep =
    darkStep !== solidStep && luminance(rgbScale[solidStep]) >= 0.03 && contrast(rgbScale[darkStep], onRgb) >= 4.5
      ? darkStep
      : lighter[solidStep];
  const hover = contrast(rgbScale[hoverStep], onRgb) >= 4.5 ? scale[hoverStep] : solid;

  // A very light primary disappears against white cards: give solid buttons a visible edge (WCAG 1.4.11, 3:1).
  const solidBorder = contrast(rgbScale[solidStep], white) < 3 ? brandText : "transparent";

  const ringBase = parseHex(brandText) as RGB;
  const focusRing = `rgba(${ringBase.map(Math.round).join(", ")}, 0.2)`;

  return { scale, solid, hover, onBrand, brandText, solidBorder, focusRing, chart: scale[500], chart2: scale[300] };
}

export function buildAccent(accentHex: string | null | undefined) {
  const a = parseHex(accentHex) ?? (parseHex(DEFAULT_ACCENT) as RGB);
  const white = parseHex(WHITE) as RGB;
  const gray900 = parseHex(GRAY_900) as RGB;
  // Same guard as the brand: darken the accent surface until its text reaches 4.5:1.
  let surface = a;
  let on = contrast(a, white) >= contrast(a, gray900) ? WHITE : GRAY_900;
  const round = (c: RGB) => parseHex(toHex(c)) as RGB; // measure the rounded colour that actually ships
  for (const w of [0.12, 0.26, 0.4, 0.54, 0.7]) {
    if (contrast(surface, parseHex(on) as RGB) >= 4.5) break;
    surface = round(mix([0, 0, 0], a, w));
    on = WHITE;
  }
  // Hover: darker if the text still passes there, else lighter, else no colour change.
  const onRgb = parseHex(on) as RGB;
  const darker = round(mix([0, 0, 0], surface, 0.12));
  const lighter = round(mix(surface, white, 0.85));
  const hover =
    luminance(surface) >= 0.03 && contrast(darker, onRgb) >= 4.5
      ? darker
      : contrast(lighter, onRgb) >= 4.5
        ? lighter
        : surface;
  return {
    accent: toHex(a), // exact tenant accent (charts, decorative)
    accentSolid: toHex(surface), // login button background
    onAccent: on,
    accentHover: toHex(hover),
  };
}

// The last brand applied, so a theme switch can re-derive the palette without reloading settings.
let lastBrand: { primary: string | null | undefined; accent: string | null | undefined } = { primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT };

export function applyTenantBrand(
  primary: string | null | undefined,
  accent: string | null | undefined,
  root: HTMLElement = document.documentElement,
  mode: ThemeMode = root.dataset.theme === "dark" ? "dark" : "light",
): void {
  if (root === document.documentElement) lastBrand = { primary, accent };
  const b = buildBrand(primary, mode);
  const a = buildAccent(accent);
  const set = (k: string, v: string) => root.style.setProperty(k, v);

  for (const [step, hex] of Object.entries(b.scale)) set(`--brand-${step}`, hex);
  set("--brand-solid", b.solid);
  set("--brand-hover", b.hover);
  set("--on-brand", b.onBrand);
  set("--brand-text", b.brandText);
  set("--brand-solid-border", b.solidBorder);
  set("--focus-ring-color", b.focusRing);
  set("--brand-chart", b.chart);
  set("--brand-chart-2", b.chart2);

  set("--accent", a.accent);
  set("--accent-solid", a.accentSolid);
  set("--on-accent", a.onAccent);
  set("--accent-hover", a.accentHover);

  // Backward compatibility — existing code (jsPDF headers, legacy CSS) reads these.
  set("--primary", b.scale[500]);
  set("--accentColor", a.accent);
}

/** Re-derive the brand palette for the current theme (call after <html data-theme> changes). */
export function reapplyTenantBrand(): void {
  applyTenantBrand(lastBrand.primary, lastBrand.accent);
}
