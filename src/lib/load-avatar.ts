// src/lib/load-avatar.ts
// import { logger } from "./logger"; // Adjust path if/when needed

export const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Important for canvas operations

    const timeoutId = setTimeout(() => {
      // logger.warn({ url }, "Image load timeout");
      reject(new Error(`Image load timeout for ${url}`));
    }, 7000); // 7-second timeout

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      // logger.warn({ url }, "Image load error");
      reject(new Error(`Image load error for ${url}`));
    };

    img.src = url;
  });
};

export const analyzeColorfulness = (
  img: HTMLImageElement,
  targetCanvas?: HTMLCanvasElement
): number => {
  try {
    if (!img.complete || img.naturalWidth === 0) {
      // logger.debug("Image not complete or zero width for colorfulness analysis.");
      return 0;
    }

    const canvas = targetCanvas || document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      // logger.warn("Could not get 2D context for colorfulness analysis.");
      return 0;
    }

    const MAX_DIM = 100;
    let drawWidth = img.naturalWidth;
    let drawHeight = img.naturalHeight;

    if (drawWidth > MAX_DIM || drawHeight > MAX_DIM) {
      if (drawWidth > drawHeight) {
        drawHeight = Math.round((MAX_DIM / drawWidth) * drawHeight);
        drawWidth = MAX_DIM;
      } else {
        drawWidth = Math.round((MAX_DIM / drawHeight) * drawWidth);
        drawHeight = MAX_DIM;
      }
    }

    canvas.width = drawWidth;
    canvas.height = drawHeight;
    ctx.drawImage(img, 0, 0, drawWidth, drawHeight);

    const sampleGridSize = 10;
    const uniqueColors = new Set<string>();
    const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight).data;

    for (let y = 0; y < sampleGridSize; y++) {
      for (let x = 0; x < sampleGridSize; x++) {
        const sampleX = Math.floor((x / sampleGridSize) * drawWidth);
        const sampleY = Math.floor((y / sampleGridSize) * drawHeight);
        const R_INDEX = (sampleY * drawWidth + sampleX) * 4;
        if (R_INDEX + 3 >= imageData.length) continue;

        const r = imageData[R_INDEX];
        const g = imageData[R_INDEX + 1];
        const b = imageData[R_INDEX + 2];
        const colorKey = `${r},${g},${b}`;
        uniqueColors.add(colorKey);
      }
    }

    return uniqueColors.size;
  } catch {
    // logger.warn({ error, src: img.src }, "Error during colorfulness analysis");
    return 0;
  }
};

export const getBestAvatarUrl = async (username: string): Promise<string> => {
  const cleanUsername = username.trim().replace(/^@/, "");
  const withAtUrl = `https://unavatar.io/twitter/@${cleanUsername}`;
  const withoutAtUrl = `https://unavatar.io/twitter/${cleanUsername}`;
  const fallbackUrl = `https://unavatar.io/${cleanUsername}`;

  const urlsToTry = [withAtUrl, withoutAtUrl, fallbackUrl];
  let bestUrl = fallbackUrl;
  let maxColorfulness = -1;

  const canvas = document.createElement("canvas");

  for (const url of urlsToTry) {
    try {
      const img = await loadImage(url);
      const colorfulness = analyzeColorfulness(img, canvas);
      // logger.debug({ url, colorfulness }, "Avatar colorfulness");

      if (colorfulness > maxColorfulness) {
        maxColorfulness = colorfulness;
        bestUrl = url;
      }
      // Optional heuristic:
      // if (maxColorfulness > 20) break;
    } catch {
      // logger.debug({ url, error }, "Failed to load or analyze avatar image candidate");
    }
  }

  // logger.info({ username, bestUrl, maxColorfulness }, "Selected best avatar URL");
  return bestUrl;
};
