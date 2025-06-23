// src/app/hooks/useDragAndDrop.ts
"use client";

import {
  useState,
  useEffect,
  useCallback,
  RefObject,
  Dispatch,
  SetStateAction,
} from "react";
import type { Placement } from "@/app/types";

interface UseDragAndDropProps {
  chartRef: RefObject<HTMLDivElement | null>; // Fix is here
  images: Placement[];
  setImages: Dispatch<SetStateAction<Placement[]>>;
  isMobile: boolean;
}

export function useDragAndDrop({
  chartRef,
  images,
  setImages,
  isMobile,
}: UseDragAndDropProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, id: string) => {
      const image = images.find((img) => img.id === id);
      if (!image || image.loading || image.isAiPlaced) return;

      setActiveDragId(id);
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, isDragging: true } : img))
      );
    },
    [images, setImages]
  );

  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!activeDragId || !chartRef.current) return; // This check makes it safe

      const chartRect = chartRef.current.getBoundingClientRect();
      let x = ((clientX - chartRect.left) / chartRect.width) * 100;
      let y = ((clientY - chartRect.top) / chartRect.height) * 100;

      x = Math.max(0, Math.min(x, 100));
      y = Math.max(0, Math.min(y, 100));

      setImages((prevImages) =>
        prevImages.map((img) =>
          img.id === activeDragId ? { ...img, position: { x, y } } : img
        )
      );
    },
    [activeDragId, chartRef, setImages]
  );

  const handleDragEnd = useCallback(() => {
    if (!activeDragId) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id === activeDragId ? { ...img, isDragging: false } : img
      )
    );
    setActiveDragId(null);
  }, [activeDragId, setImages]);

  // Mouse event listener
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (activeDragId) handleDragMove(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, [activeDragId, handleDragMove, handleDragEnd]);

  // Touch event listener
  useEffect(() => {
    const preventDefault = (e: TouchEvent) => e.preventDefault();
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (activeDragId && e.touches[0]) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    if (activeDragId) {
      document.body.style.overflow = "hidden";
      document.addEventListener("touchmove", preventDefault, {
        passive: false,
      });
      window.addEventListener("touchmove", handleGlobalTouchMove, {
        passive: false,
      });
      window.addEventListener("touchend", handleDragEnd);
      window.addEventListener("touchcancel", handleDragEnd);
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("touchmove", preventDefault);
      window.removeEventListener("touchmove", handleGlobalTouchMove);
      window.removeEventListener("touchend", handleDragEnd);
      window.removeEventListener("touchcancel", handleDragEnd);
    };
  }, [activeDragId, isMobile, handleDragMove, handleDragEnd]);

  return { handleDragStart };
}
