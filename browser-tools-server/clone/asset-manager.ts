import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { createHash } from "crypto";

interface AssetCandidate {
  url: string;
  type?: string;
  descriptor?: Record<string, unknown>;
}

interface AssetPayload {
  capturedAt?: string;
  documentUrl?: string;
  baseHref?: string | null;
  assets?: AssetCandidate[];
}

export interface AssetManifestEntry {
  originalUrl: string;
  status: "downloaded" | "skipped" | "failed";
  localPath?: string;
  contentType?: string | null;
  hash?: string;
  bytes?: number;
  type?: string;
  descriptor?: Record<string, unknown>;
  error?: string;
}

const inferExtension = (urlString: string, contentType: string | null): string => {
  try {
    const { pathname } = new URL(urlString);
    const ext = path.extname(pathname);
    if (ext) {
      return ext;
    }
  } catch (error) {
    // ignore parse failure and fall back to content type
  }

  if (!contentType) {
    return "";
  }

  const subtype = contentType.split("/")[1];
  if (!subtype) {
    return "";
  }

  if (subtype.includes("svg")) {
    return ".svg";
  }
  if (subtype.includes("png")) {
    return ".png";
  }
  if (subtype.includes("jpeg") || subtype.includes("jpg")) {
    return ".jpg";
  }
  if (subtype.includes("webp")) {
    return ".webp";
  }
  if (subtype.includes("gif")) {
    return ".gif";
  }
  if (subtype.includes("woff2")) {
    return ".woff2";
  }
  if (subtype.includes("woff")) {
    return ".woff";
  }
  if (subtype.includes("ttf")) {
    return ".ttf";
  }
  if (subtype.includes("otf")) {
    return ".otf";
  }

  return "";
};

export async function processAssetPayload(
  workspacePath: string,
  payload: AssetPayload
): Promise<{
  capturedAt?: string;
  documentUrl?: string;
  baseHref?: string | null;
  assets: AssetManifestEntry[];
}> {
  const assetsDir = path.join(workspacePath, "assets");
  await fs.promises.mkdir(assetsDir, { recursive: true });

  const manifest: AssetManifestEntry[] = [];
  const seen = new Set<string>();
  const baseHref = payload.baseHref || payload.documentUrl || undefined;

  const candidates = Array.isArray(payload.assets) ? payload.assets : [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.url !== "string") {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(candidate.url, baseHref).toString();
    } catch (error) {
      manifest.push({
        originalUrl: candidate.url,
        status: "failed",
        type: candidate.type,
        descriptor: candidate.descriptor,
        error: "Invalid URL",
      });
      continue;
    }

    if (resolvedUrl.startsWith("data:")) {
      manifest.push({
        originalUrl: resolvedUrl,
        status: "skipped",
        type: candidate.type,
        descriptor: candidate.descriptor,
        error: "Data URLs are not downloaded",
      });
      continue;
    }

    if (seen.has(resolvedUrl)) {
      manifest.push({
        originalUrl: resolvedUrl,
        status: "skipped",
        type: candidate.type,
        descriptor: candidate.descriptor,
        error: "Duplicate URL",
      });
      continue;
    }
    seen.add(resolvedUrl);

    try {
      const response = await fetch(resolvedUrl);
      if (!response.ok) {
        manifest.push({
          originalUrl: resolvedUrl,
          status: "failed",
          type: candidate.type,
          descriptor: candidate.descriptor,
          error: `HTTP ${response.status}`,
        });
        continue;
      }

      const buffer = await response.buffer();
      const contentType = response.headers.get("content-type");
      const hash = createHash("sha256").update(buffer).digest("hex");
      const extension = inferExtension(resolvedUrl, contentType);
      const fileName = extension ? `${hash}${extension}` : hash;
      const relativePath = path.join("assets", fileName);

      await fs.promises.writeFile(
        path.join(workspacePath, relativePath),
        buffer
      );

      manifest.push({
        originalUrl: resolvedUrl,
        status: "downloaded",
        localPath: relativePath,
        contentType,
        hash,
        bytes: buffer.length,
        type: candidate.type,
        descriptor: candidate.descriptor,
      });
    } catch (error) {
      manifest.push({
        originalUrl: resolvedUrl,
        status: "failed",
        type: candidate.type,
        descriptor: candidate.descriptor,
        error:
          error instanceof Error ? error.message : "Unknown download error",
      });
    }
  }

  return {
    capturedAt: payload.capturedAt,
    documentUrl: payload.documentUrl,
    baseHref: payload.baseHref || payload.documentUrl || null,
    assets: manifest,
  };
}
