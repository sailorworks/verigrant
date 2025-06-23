// src/app/hooks/useChartSizing.ts
"use client";

import { useState, useEffect, RefObject } from "react";

// The only change is in the function signature below
export function useChartSizing(containerRef: RefObject<HTMLDivElement | null>) {
  const [chartSize, setChartSize] = useState({ width: 500, height: 500 });
  const [imageSize, setImageSize] = useState(60);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateSizes = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);

      if (containerRef.current) {
        // This check was already here, so the logic is safe
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const reservedVerticalSpace = isCurrentlyMobile ? 250 : 220;
        const availableHeight = viewportHeight - reservedVerticalSpace;
        const horizontalPadding = isCurrentlyMobile
          ? 40
          : Math.max(20, viewportWidth * 0.05);
        const availableWidth = viewportWidth - horizontalPadding * 2;
        const size = Math.max(
          250,
          Math.min(availableWidth, availableHeight, 800)
        );

        setChartSize({ width: size, height: size });
        setImageSize(Math.max(40, Math.min(80, size / 8)));
      }
    };

    updateSizes();
    window.addEventListener("resize", updateSizes);
    return () => window.removeEventListener("resize", updateSizes);
  }, [containerRef]);

  return { chartSize, imageSize, isMobile };
}
