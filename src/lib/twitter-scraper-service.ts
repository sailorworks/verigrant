// src/lib/twitter-scraper-service.ts
import { Scraper } from "agent-twitter-client";
import type {
  Profile as ScraperProfile,
  Tweet as ScraperTweet,
} from "agent-twitter-client";
import { getCachedData, setCachedData } from "./redis"; // Ensure redis.ts is correctly imported
import { logger } from "./logger"; // Ensure logger.ts is correctly imported

const TWITTER_COOKIES_KEY = "twitter_session_cookies:v1";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Singleton instance management for the scraper
let scraperInstance: Scraper | null = null;
let isInitializing = false;
let initializationPromise: Promise<Scraper> | null = null;

async function _initializeScraper(): Promise<Scraper> {
  logger.info("Initializing Twitter scraper...");
  // Use a proxy if configured, especially for browser or restrictive server environments
  const currentScraper = new Scraper({
    // proxy: process.env.PROXY_URL || undefined, // Uncomment and configure if needed
  });

  const cachedCookiesString = await getCachedData<string>(TWITTER_COOKIES_KEY);

  if (cachedCookiesString) {
    try {
      logger.info("Attempting to set cookies from cache.");
      // agent-twitter-client's setCookies expects an array of cookie objects.
      // The README implies getCookies() provides this directly for saving.
      await currentScraper.setCookies(JSON.parse(cachedCookiesString));
      const isLoggedIn = await currentScraper.isLoggedIn();
      if (isLoggedIn) {
        logger.info("Successfully logged in using cached cookies.");
        scraperInstance = currentScraper;
        return currentScraper;
      }
      logger.warn(
        "Cached cookies were found but login validation failed. Proceeding to full login."
      );
    } catch (cookieError) {
      logger.error(
        { err: cookieError },
        "Error setting or validating cached cookies. Proceeding to full login."
      );
      await currentScraper.clearCookies(); // Clear potentially corrupted cookies
    }
  } else {
    logger.info("No cached cookies found. Proceeding to full login.");
  }

  const username = process.env.TWITTER_USERNAME;
  const password = process.env.TWITTER_PASSWORD;
  const email = process.env.TWITTER_EMAIL; // Needed for some login flows or if basic login fails

  if (!username || !password) {
    logger.error(
      "TWITTER_USERNAME or TWITTER_PASSWORD environment variables are not set."
    );
    throw new Error(
      "Twitter authentication credentials missing in environment variables."
    );
  }

  try {
    logger.info(`Attempting login with username: ${username}`);
    // The README shows basic login as: await scraper.login('username', 'password');
    // It also lists TWITTER_EMAIL as an auth env var.
    // We'll use the basic signature first. If your `agent-twitter-client` version requires email for basic, adjust.
    await currentScraper.login(username, password, email); // Pass email as per README's env var list
    logger.info("Login successful.");

    const cookiesToCache = await currentScraper.getCookies();
    await setCachedData(
      TWITTER_COOKIES_KEY,
      JSON.stringify(cookiesToCache),
      COOKIE_TTL_SECONDS
    );
    logger.info("New cookies saved to cache.");
    scraperInstance = currentScraper;
    return currentScraper;
  } catch (loginError) {
    logger.error({ err: loginError }, "Twitter login failed.");
    throw loginError; // Re-throw to be caught by the caller
  }
}

export async function getTwitterScraper(): Promise<Scraper> {
  if (scraperInstance) {
    // Optionally, add a quick check like `isLoggedIn()` if performance isn't critical
    // For now, we assume if instance exists and initialized, it's good.
    // More robust would be to re-check isLoggedIn() and re-initialize if false.
    const stillLoggedIn = await scraperInstance.isLoggedIn();
    if (stillLoggedIn) {
      return scraperInstance;
    }
    logger.warn(
      "Previously initialized scraper is no longer logged in. Re-initializing."
    );
    scraperInstance = null; // Force re-initialization
    initializationPromise = null;
  }

  if (isInitializing && initializationPromise) {
    return initializationPromise;
  }

  isInitializing = true;
  initializationPromise = _initializeScraper()
    .catch((err) => {
      initializationPromise = null; // Clear promise on error so next call retries
      isInitializing = false;
      throw err; // Propagate error
    })
    .finally(() => {
      isInitializing = false;
    });

  return initializationPromise;
}

// Export types for convenience if needed elsewhere
export type { ScraperProfile, ScraperTweet };
