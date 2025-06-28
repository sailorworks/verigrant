// src/lib/indexed-db.ts
import type { AlignmentAnalysis } from "@/app/actions/analyze-tweets"; // Adjust path
import type { Placement } from "@/app/types"; // This will be defined in page.tsx
import { logger } from "./logger"; // Adjust path

export interface StoredPlacement {
  id: string;
  src: string;
  position: {
    x: number;
    y: number;
  };
  username?: string;
  analysis?: AlignmentAnalysis; // Storing the core analysis part
  isAiPlaced?: boolean;
  timestamp?: string; // Store as ISO string
}

const DB_NAME = "alignment-chart-db";
const DB_VERSION = 2; // Increment version if schema changes (e.g., adding indexes)
const PLACEMENTS_STORE = "placements"; // Changed from 'users' for clarity

interface IndexedDBInstance {
  db: IDBDatabase | null;
  isInitializing: boolean;
  onInitializeCallbacks: Array<() => void>; // Renamed for clarity
}

const dbInstance: IndexedDBInstance = {
  // Renamed for clarity
  db: null,
  isInitializing: false,
  onInitializeCallbacks: [],
};

export function initIndexedDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (dbInstance.db) {
      resolve();
      return;
    }

    if (dbInstance.isInitializing) {
      dbInstance.onInitializeCallbacks.push(resolve); // Simpler: just resolve when done
      return;
    }

    dbInstance.isInitializing = true;

    if (typeof window === "undefined" || !window.indexedDB) {
      logger.error("IndexedDB not supported or not in browser environment.");
      dbInstance.isInitializing = false;
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      logger.error({ event }, "IndexedDB error during open/upgrade");
      dbInstance.isInitializing = false;
      // Clean up callbacks that will never fire
      dbInstance.onInitializeCallbacks = [];
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = (event) => {
      dbInstance.db = (event.target as IDBOpenDBRequest).result;
      dbInstance.isInitializing = false;
      logger.info("IndexedDB initialized successfully.");
      dbInstance.onInitializeCallbacks.forEach((callback) => callback());
      dbInstance.onInitializeCallbacks = [];
      resolve();
    };

    request.onupgradeneeded = (event) => {
      logger.info("IndexedDB upgrade needed.");
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PLACEMENTS_STORE)) {
        db.createObjectStore(PLACEMENTS_STORE, { keyPath: "id" });
        logger.info(`Object store "${PLACEMENTS_STORE}" created.`);
      }
      // Example: Add an index if you need to query by username
      // const store = (event.target as IDBOpenDBRequest).transaction?.objectStore(PLACEMENTS_STORE);
      // if (store && !store.indexNames.contains('username')) {
      //   store.createIndex('username', 'username', { unique: false });
      // }
    };
  });
}

// Convert full Placement (from UI state) to StoredPlacement
function toStoredPlacement(placement: Placement): StoredPlacement {
  return {
    id: placement.id,
    src: placement.src,
    position: placement.position,
    username: placement.username,
    analysis: placement.analysis, // Assuming Placement has AlignmentAnalysis directly
    isAiPlaced: placement.isAiPlaced,
    timestamp:
      placement.timestamp instanceof Date
        ? placement.timestamp.toISOString()
        : new Date().toISOString(),
  };
}

export async function cachePlacementsLocally(
  placements: Placement[]
): Promise<void> {
  await initIndexedDB();
  if (!dbInstance.db) {
    logger.error("IndexedDB not initialized, cannot cache placements.");
    throw new Error("IndexedDB not initialized");
  }

  const storedPlacements = placements.map(toStoredPlacement);
  // logger.debug({ count: storedPlacements.length }, "Saving placements to IndexedDB");

  return new Promise((resolve, reject) => {
    const transaction = dbInstance.db!.transaction(
      [PLACEMENTS_STORE],
      "readwrite"
    );
    const store = transaction.objectStore(PLACEMENTS_STORE);

    // Clear existing store before adding new set of placements
    const clearRequest = store.clear();

    clearRequest.onerror = (event) => {
      logger.error({ event }, "Error clearing IndexedDB store");
      reject(new Error("Failed to clear IndexedDB store"));
    };

    clearRequest.onsuccess = () => {
      if (storedPlacements.length === 0) {
        resolve();
        return;
      }

      let successCount = 0;
      storedPlacements.forEach((placement) => {
        const addRequest = store.add(placement);
        addRequest.onsuccess = () => {
          successCount++;
          if (successCount === storedPlacements.length) {
            resolve();
          }
        };
        addRequest.onerror = (event) => {
          logger.error(
            { event, placementId: placement.id },
            "Error adding placement to IndexedDB"
          );
          // Don't reject immediately, try to save others.
          // Consider how to handle partial failures. For now, we'll let it try to complete.
          // If this is the last one and it failed, the promise might hang if not handled.
          // A more robust solution might collect errors and reject with details.
          if (
            successCount + (storedPlacements.length - successCount - 1) <
            storedPlacements.length - 1
          ) {
            // if this is the last one to process (success or fail)
            if (successCount === storedPlacements.length - 1)
              resolve(); // resolve if others succeeded
            else reject(new Error("Failed to add one or more placements"));
          }
        };
      });
    };

    transaction.oncomplete = () => {
      // logger.debug("Transaction completed for caching placements.");
      // Resolve here if not already resolved by individual add ops (safer for batch)
      // This is tricky with clear + multiple adds. The above logic aims to resolve after all adds.
    };
    transaction.onerror = (event) => {
      logger.error(
        { event },
        "IndexedDB transaction error during cachePlacementsLocally"
      );
      reject(new Error("IndexedDB transaction failed"));
    };
  });
}

export async function loadCachedPlacements(): Promise<StoredPlacement[]> {
  await initIndexedDB();
  if (!dbInstance.db) {
    logger.info(
      "IndexedDB not initialized, returning empty array for cached placements."
    );
    return [];
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = dbInstance.db!.transaction(
        [PLACEMENTS_STORE],
        "readonly"
      );
      const store = transaction.objectStore(PLACEMENTS_STORE);
      const request = store.getAll();

      request.onerror = (event) => {
        logger.error({ event }, "Error loading placements from IndexedDB");
        reject(new Error("Failed to load placements from IndexedDB"));
      };

      request.onsuccess = () => {
        // logger.debug({ count: request.result.length }, "Loaded placements from IndexedDB");
        resolve(request.result as StoredPlacement[]);
      };
    } catch (error) {
      logger.error(
        { error },
        "Exception during loadCachedPlacements transaction setup"
      );
      reject(error);
    }
  });
}

export async function removeCachedPlacement(id: string): Promise<void> {
  await initIndexedDB();
  if (!dbInstance.db) {
    logger.error("IndexedDB not initialized, cannot remove placement.");
    throw new Error("IndexedDB not initialized");
  }

  return new Promise((resolve, reject) => {
    const transaction = dbInstance.db!.transaction(
      [PLACEMENTS_STORE],
      "readwrite"
    );
    const store = transaction.objectStore(PLACEMENTS_STORE);
    const request = store.delete(id);

    request.onerror = (event) => {
      logger.error({ event, id }, "Error deleting placement from IndexedDB");
      reject(new Error("Failed to delete placement"));
    };
    request.onsuccess = () => {
      // logger.debug({ id }, "Removed placement from IndexedDB");
      resolve();
    };
  });
}

export async function clearLocalCache(): Promise<void> {
  await initIndexedDB();
  if (!dbInstance.db) {
    logger.info("IndexedDB not initialized, cannot clear cache.");
    return; // Or throw error
  }

  return new Promise((resolve, reject) => {
    const transaction = dbInstance.db!.transaction(
      [PLACEMENTS_STORE],
      "readwrite"
    );
    const store = transaction.objectStore(PLACEMENTS_STORE);
    const request = store.clear();

    request.onerror = (event) => {
      logger.error({ event }, "Error clearing IndexedDB store");
      reject(new Error("Failed to clear IndexedDB store"));
    };
    request.onsuccess = () => {
      logger.info("Cleared local IndexedDB cache.");
      resolve();
    };
  });
}
