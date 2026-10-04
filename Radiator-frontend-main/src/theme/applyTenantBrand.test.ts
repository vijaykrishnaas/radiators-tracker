// Run: node --experimental-strip-types --test applyTenantBrand.test.ts   (Node 22+)
// Or port to the project's test runner (Vitest/Jest) unchanged apart from imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrand, buildAccent, contrast, parseHex, DEFAULT_PRIMARY } from "./applyTenantBrand.ts";

const W = parseHex("#FFFFFF")!;
const cases = {
  default: "#12467A",
  tailadmin: "#465FFF",
  loginDefault: "#2264E5",
  lightYellow: "#FFF59D",
  nearWhite: "#F5F5F5",
  nearBlack: "#0B0B0F",
  midGray: "#8A8A8A",
  red: "#E53935",
  limeGreen: "#76FF03",
};

for (const [name, hex] of Object.entries(cases)) {
  test(`${name} ${hex}: contrast guards hold`, () => {
    const b = buildBrand(hex);
    assert.equal(b.scale[500], hex.toUpperCase(), "brand-500 must equal tenant primary");
    const solid = parseHex(b.solid)!;
    assert.ok(contrast(solid, parseHex(b.onBrand)!) >= 4.5,
      `on-brand text contrast ${contrast(solid, parseHex(b.onBrand)!).toFixed(2)}`);
    assert.ok(contrast(parseHex(b.brandText)!, W) >= 4.5, "brand-text on white ≥ 4.5");
    assert.ok(contrast(parseHex(b.brandText)!, parseHex(b.scale[50])!) >= 4.5, "brand-text on brand-50 ≥ 4.5");
    assert.equal(Object.keys(b.scale).length, 12);
    assert.ok(contrast(parseHex(b.hover)!, parseHex(b.onBrand)!) >= 4.5,
      `hover text contrast ${contrast(parseHex(b.hover)!, parseHex(b.onBrand)!).toFixed(2)}`);
  });
}

test("very light primary gets a visible button border", () => {
  assert.notEqual(buildBrand("#FFF59D").solidBorder, "transparent");
  assert.equal(buildBrand("#12467A").solidBorder, "transparent");
});

test("near-black primary hovers lighter, not darker", () => {
  const b = buildBrand("#0B0B0F");
  assert.equal(b.hover, b.scale[400]);
});

test("hover never equals a colour that breaks text contrast (sweep of 4,096 primaries)", () => {
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let bl = 0; bl < 256; bl += 17) {
    const hex = "#" + [r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("");
    const b = buildBrand(hex);
    const on = parseHex(b.onBrand)!;
    assert.ok(contrast(parseHex(b.solid)!, on) >= 4.5, `${hex} solid`);
    assert.ok(contrast(parseHex(b.hover)!, on) >= 4.5, `${hex} hover`);
    assert.ok(contrast(parseHex(b.brandText)!, W) >= 4.5, `${hex} brand-text`);
    const a = buildAccent(hex);
    assert.ok(contrast(parseHex(a.accentSolid)!, parseHex(a.onAccent)!) >= 4.5, `${hex} accent`);
    assert.ok(contrast(parseHex(a.accentHover)!, parseHex(a.onAccent)!) >= 4.5, `${hex} accent hover`);
  }
});

test("invalid / missing input falls back to default", () => {
  for (const bad of [undefined, null, "", "blue", "#12", "#GGGGGG"]) {
    assert.equal(buildBrand(bad as any).scale[500], DEFAULT_PRIMARY.toUpperCase());
  }
  assert.equal(buildBrand("#abc").scale[500], "#AABBCC");
  assert.equal(buildBrand("#12467Aff").scale[500], "#12467A"); // 8-digit hex: alpha ignored
  assert.equal(buildBrand(" 12467a ").scale[500], "#12467A");  // no #, whitespace
});

test("solid stays the exact primary whenever it can", () => {
  for (const h of ["#12467A", "#465FFF", "#FFF59D", "#8A8A8A"]) assert.equal(buildBrand(h).solid, h.toUpperCase());
  assert.notEqual(buildBrand("#E53935").solid, "#E53935"); // mid red: darkened for legible text
});

test("accent: on-accent picks readable text", () => {
  for (const h of ["#F47F6B", "#E53935", "#FFEB3B", "#12467A", "#8A8A8A", "#0B0B0F", "#FFFFFF"]) {
    const a = buildAccent(h);
    assert.ok(contrast(parseHex(a.accentSolid)!, parseHex(a.onAccent)!) >= 4.5, h);
    assert.ok(contrast(parseHex(a.accentHover)!, parseHex(a.onAccent)!) >= 4.5, `${h} hover`);
  }
  assert.equal(buildAccent("#F47F6B").onAccent, "#101828");
  assert.equal(buildAccent("#12467A").onAccent, "#FFFFFF");
});
