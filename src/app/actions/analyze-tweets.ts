// src/app/actions/analyze-tweets.ts
"use server";
import "server-only";
import { dedent } from "ts-dedent";
import { google } from "@ai-sdk/google";
import { CoreMessage, generateObject } from "ai";
import { z } from "zod";
import { getCachedData, setCachedData } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { getTwitterScraper } from "@/lib/twitter-scraper-service";

// Type guard to check if error has a status property
function hasStatus(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  );
}

// Define interfaces for Twitter scraper data
interface ScraperProfile {
  name?: string;
  biography?: string; // Common field for bio
  location?: string;
  followersCount?: number;
  tweetsCount?: number;
  avatar?: string; // From agent-twitter-client README
  profile_image_url_https?: string; // Fallback from Twitter API
}

interface ScraperTweet {
  text: string;
  created_at?: string; // ISO string
  timeParsed?: Date; // Possible parsed date from scraper
  timestamp?: number; // Possible Unix timestamp
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number; // Common but not guaranteed
  quote_count?: number; // Common but not guaranteed
  is_quote_status?: boolean;
  quoted_status_id_str?: string;
  quotedStatus?: unknown; // Minimal handling for quoted status
  is_retweet?: boolean;
}

// Define schema for alignment analysis
const AlignmentSchema = z.object({
  explanation: z
    .string()
    .describe(
      "Your brief-ish explanation/reasoning for the given alignment assessment. Max 2-3 sentences."
    ),
  lawfulChaotic: z
    .number()
    .min(-100)
    .max(100)
    .describe("A score from -100 (very lawful) to 100 (very chaotic)"),
  goodEvil: z
    .number()
    .min(-100)
    .max(100)
    .describe("A score from -100 (very good) to 100 (very evil)"),
});

export type AlignmentAnalysis = z.infer<typeof AlignmentSchema>;

export type AlignmentAnalysisResult = AlignmentAnalysis & {
  cached: boolean;
  isError: boolean;
  avatarUrl?: string;
};

// Internal types for AI processing
interface InternalTweet {
  text: string;
  created_at: string; // ISO string
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  is_quote_status: boolean;
}

interface InternalProfileForAI {
  name?: string;
  bio?: string;
  location?: string;
  followers_count?: number;
  statuses_count?: number;
  tweets: InternalTweet[];
}

export async function analyseUser(
  username: string
): Promise<AlignmentAnalysisResult> {
  const cleanUsername = username.trim().replace(/^@/, "");
  const cacheKey = `analysis-gemini-v3:${cleanUsername}`;

  try {
    const cachedAnalysisData =
      await getCachedData<AlignmentAnalysisResult>(cacheKey);
    if (cachedAnalysisData?.explanation && !cachedAnalysisData.isError) {
      logger.info(
        { username: cleanUsername },
        `Using cached analysis for @${cleanUsername}`
      );
      return { ...cachedAnalysisData, cached: true, isError: false };
    }

    logger.info(
      { username: cleanUsername },
      `Fetching Twitter data for @${cleanUsername} using agent-twitter-client`
    );

    let userProfileData: ScraperProfile | undefined;
    const userTweetsData: ScraperTweet[] = [];
    let fetchedAvatarUrl: string | undefined;

    try {
      const scraper = await getTwitterScraper();
      userProfileData = await scraper.getProfile(cleanUsername);

      if (!userProfileData) {
        logger.warn(
          { username: cleanUsername },
          `No profile found by agent-twitter-client for @${cleanUsername}.`
        );
        return {
          lawfulChaotic: 0,
          goodEvil: 0,
          explanation: `Could not retrieve profile for @${cleanUsername}. The user may be private, non-existent, suspended, or X/Twitter access failed.`,
          cached: false,
          isError: true,
        };
      }

      fetchedAvatarUrl =
        userProfileData.avatar || userProfileData.profile_image_url_https;
      logger.debug(
        { username: cleanUsername, userProfileData },
        "Fetched user profile data."
      );

      // Collect tweets from async generator
      const tweetGenerator = await scraper.getTweets(cleanUsername, 20);

      for await (const tweet of tweetGenerator) {
        if (tweet.text) {
          userTweetsData.push(tweet as ScraperTweet);
        }
        if (userTweetsData.length >= 20) break;
      }

      logger.info(
        { username: cleanUsername, tweetCount: userTweetsData.length },
        `Fetched ${userTweetsData.length} tweets for @${cleanUsername}`
      );
    } catch (fetchError) {
      logger.error(
        { err: fetchError, username: cleanUsername },
        `Error fetching data from Twitter for @${cleanUsername}`
      );
      let errorExplanation = `An error occurred while fetching data for @${cleanUsername} from X/Twitter.`;

      if (fetchError instanceof Error) {
        const message = fetchError.message?.toLowerCase() || "";

        if (message.includes("login")) {
          errorExplanation =
            "Failed to log in to X/Twitter to fetch data. Please check server credentials/configuration.";
        } else if (
          message.includes("not found") ||
          message.includes("no user") ||
          (hasStatus(fetchError) && fetchError.status === 404)
        ) {
          errorExplanation = `User @${cleanUsername} not found on X/Twitter or their profile is inaccessible.`;
        }
      }

      return {
        lawfulChaotic: 0,
        goodEvil: 0,
        explanation: errorExplanation,
        cached: false,
        isError: true,
        avatarUrl: fetchedAvatarUrl,
      };
    }

    const transformedProfileForAI: InternalProfileForAI = {
      name: userProfileData.name,
      bio: userProfileData.biography,
      location: userProfileData.location,
      followers_count: userProfileData.followersCount,
      statuses_count: userProfileData.tweetsCount,
      tweets: userTweetsData
        .filter((tweet) => tweet.text?.trim())
        .map((tweet) => {
          let createdAtDate: Date;
          if (tweet.timeParsed instanceof Date) {
            createdAtDate = tweet.timeParsed;
          } else if (tweet.created_at) {
            createdAtDate = new Date(tweet.created_at);
          } else if (typeof tweet.timestamp === "number") {
            createdAtDate = new Date(tweet.timestamp * 1000);
          } else {
            createdAtDate = new Date();
          }

          return {
            text: tweet.text,
            created_at: createdAtDate.toISOString(),
            favorite_count: tweet.favorite_count ?? 0,
            retweet_count: tweet.retweet_count ?? 0,
            reply_count: tweet.reply_count ?? 0,
            quote_count: tweet.quote_count ?? 0,
            is_quote_status:
              tweet.is_quote_status ??
              (!!tweet.quoted_status_id_str || !!tweet.quotedStatus),
          };
        }),
    };

    const profileStrForAI = JSON.stringify(
      {
        name: transformedProfileForAI.name,
        bio: transformedProfileForAI.bio,
        location: transformedProfileForAI.location,
        followers_count: transformedProfileForAI.followers_count,
        statuses_count: transformedProfileForAI.statuses_count,
      },
      null,
      2
    );

    const tweetTexts = transformedProfileForAI.tweets
      .map(
        (tweet) =>
          `<post${tweet.is_quote_status ? ' is_quote="true"' : ""}>
Text: ${tweet.text}
Stats: ${tweet.favorite_count} likes, ${tweet.reply_count} replies, ${tweet.retweet_count} retweets, ${tweet.quote_count} quotes
</post>`
      )
      .join("\n\n");

    if (
      transformedProfileForAI.tweets.length === 0 &&
      !transformedProfileForAI.bio?.trim() &&
      !transformedProfileForAI.name?.trim()
    ) {
      logger.info(
        { username: cleanUsername },
        "User has no public tweets and minimal profile info for AI analysis."
      );
      return {
        lawfulChaotic: 0,
        goodEvil: 0,
        explanation: `User @${cleanUsername} has no public tweets and minimal profile information that could be meaningfully analyzed by AI.`,
        cached: false,
        isError: true,
        avatarUrl: fetchedAvatarUrl,
      };
    }

    const systemPrompt = dedent`
      You are an expert D&D alignment analyst. Analyze the provided Twitter user profile and their recent tweets to determine their alignment on a D&D-style chart.
      ...
    `.trim();

    const userPromptContent = dedent`Username: @${cleanUsername}

<user_profile>
${profileStrForAI}
</user_profile>

<user_tweets limit="top_20_recent">
${tweetTexts || "No public tweets found or provided for analysis."}
</user_tweets>

Please provide your analysis.`.trim();

    const messages: CoreMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPromptContent },
    ];

    const {
      object: analysisResultData,
      usage,
      finishReason,
    } = await generateObject({
      model: google("gemini-1.5-flash-latest"),
      temperature: 0.5,
      schema: AlignmentSchema,
      messages,
    });

    logger.info(
      { username: cleanUsername, usage, finishReason },
      "Gemini analysis complete"
    );

    const finalResult: AlignmentAnalysisResult = {
      ...analysisResultData,
      cached: false,
      isError: false,
      avatarUrl: fetchedAvatarUrl,
    };
    await setCachedData(cacheKey, finalResult, 604_800);

    return finalResult;
  } catch (error) {
    logger.error(
      { err: error, username: cleanUsername },
      `Critical error in analyseUser for @${cleanUsername}`
    );
    let errorMessage = `Error analyzing tweets for @${cleanUsername}. Please check the username and try again.`;
    if (error instanceof Error) {
      if (error.message.includes("API key not valid")) {
        errorMessage = "AI service API key is invalid or missing.";
      } else if (error.message.toLowerCase().includes("quota")) {
        errorMessage = "AI service quota exceeded.";
      }
    }
    return {
      lawfulChaotic: 0,
      goodEvil: 0,
      explanation: errorMessage,
      cached: false,
      isError: true,
    };
  }
}
