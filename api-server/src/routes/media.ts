import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "node:stream";

const router: IRouter = Router();

router.get("/media/proxy", async (req: Request, res: Response) => {
  try {
    const url = String(req.query.url || "").trim();
    if (!url) {
      res.status(400).json({ error: "bad_request", message: "Missing url" });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ error: "bad_request", message: "Invalid url" });
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ error: "bad_request", message: "Only http/https supported" });
      return;
    }

    const upstream = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        // Some hosts block unknown UAs; this is harmless but improves reliability.
        "User-Agent": "TrailFinder/1.0 (+image-proxy)",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok || !upstream.body) {
      res.status(502).json({
        error: "bad_gateway",
        message: `Upstream error (${upstream.status})`,
      });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

    // Stream the image
    // Node fetch returns a WHATWG ReadableStream; convert to Node stream first.
    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.on("error", (e) => {
      console.error("Media proxy stream error:", e);
      if (!res.headersSent) res.status(502);
      res.end();
    });
    nodeStream.pipe(res);
  } catch (err) {
    console.error("Error proxying media:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to proxy media" });
  }
});

export default router;

