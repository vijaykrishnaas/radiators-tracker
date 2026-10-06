// Loads an uploaded image (logo / QR / signature) for jsPDF. jsPDF only takes PNG or JPEG data reliably, so any
// other type the uploader accepts (SVG, WebP) is redrawn onto a canvas and handed over as PNG. Before this, an SVG
// or WebP QR was passed in labelled "PNG", jsPDF threw, and the bill silently printed without it.
export const BACKEND: string = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";

export const assetUrl = (url?: string) => (!url ? "" : url.startsWith("/") ? `${BACKEND}${url}` : url);

const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
    });

async function rasterToPng(blob: Blob): Promise<string> {
    const src = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("image decode failed"));
            i.src = src;
        });
        // SVGs without width/height report 0×0 (or 150×150); give them a print-sharp size.
        const w = img.naturalWidth || 600;
        const h = img.naturalHeight || 600;
        const scale = Math.max(1, 600 / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
    } finally {
        URL.revokeObjectURL(src);
    }
}

export async function fetchPdfImage(url: string): Promise<{ dataUrl: string; format: "PNG" | "JPEG" }> {
    const resp = await fetch(assetUrl(url));
    if (!resp.ok) throw new Error("image fetch failed");
    const blob = await resp.blob();
    const type = (blob.type || resp.headers.get("content-type") || "").toLowerCase();
    if (type.includes("png")) return { dataUrl: await blobToDataUrl(blob), format: "PNG" };
    if (type.includes("jpeg") || type.includes("jpg")) return { dataUrl: await blobToDataUrl(blob), format: "JPEG" };
    return { dataUrl: await rasterToPng(blob), format: "PNG" };
}
