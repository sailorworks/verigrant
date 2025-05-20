// src/app/actions/analyze-tweets.ts
"use server";
import "server-only"; // Ensures this code only runs on the server
import { dedent } from "ts-dedent";
import { google } from "@ai-sdk/google";
import { CoreMessage, generateObject } from "ai";
import { z } from "zod";
import { getCachedData, setCachedData } from "@/lib/redis"; // Adjust path
import { fetchTwitterProfile } from "@/lib/fetch-twitter-profile"; // Adjust path
import { logger } from "@/lib/logger"; // Adjust path

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

// This is the type that will be returned to the client
export type AlignmentAnalysisResult = AlignmentAnalysis & {
  cached: boolean;
  isError: boolean;
  // username: string; // Optionally include username if needed by client directly from this result
};

export async function analyseUser(
  username: string
): Promise<AlignmentAnalysisResult> {
  const cleanUsername = username.trim().replace(/^@/, "");
  const cacheKey = `analysis-gemini-v3:${cleanUsername}`; // Use a versioned cache key

  try {
    const cachedAnalysis = await getCachedData<AlignmentAnalysis>(cacheKey);

    if (cachedAnalysis) {
      logger.info(
        { username: cleanUsername },
        `Using cached analysis for @${cleanUsername}`
      );
      // waitUntil(track("analysis_cached", { // If using Vercel Analytics
      //   username: cleanUsername,
      //   lawful_chaotic: cachedAnalysis.lawfulChaotic,
      //   good_evil: cachedAnalysis.goodEvil,
      // }));
      return { ...cachedAnalysis, cached: true, isError: false };
    }

    logger.info(
      { username: cleanUsername },
      `Analyzing tweets for @${cleanUsername}`
    );

    const profile = await fetchTwitterProfile(cleanUsername); // Pass cleanUsername
    if (!profile) {
      logger.warn(
        { username: cleanUsername },
        `No profile found by fetchTwitterProfile for @${cleanUsername}`
      );
      // Consider if this should be a specific error message
      return {
        lawfulChaotic: 0,
        goodEvil: 0,
        explanation: `Could not retrieve profile or tweets for @${cleanUsername}. The user might be private, non-existent, or there was an issue fetching their data.`,
        cached: false,
        isError: true,
      };
    }

    // Prepare data for AI
    const profile_str_for_ai = JSON.stringify(
      {
        name: profile.name,
        bio: profile.bio,
        location: profile.location,
        followers_count: profile.followers_count,
        statuses_count: profile.statuses_count,
        // No tweets in profile string to keep it concise
      },
      null,
      2
    );

    const tweetTexts = profile.tweets
      .slice(0, 50)
      .map(
        (
          tweet // Limit tweets to avoid overly long prompts
        ) =>
          `<post${tweet.is_quote_status ? ' is_quote="true"' : ""}>
Text: ${tweet.text}
Stats: ${tweet.favorite_count || 0} likes, ${tweet.reply_count || 0} replies, ${
            tweet.retweet_count || 0
          } retweets, ${tweet.quote_count || 0} quotes
</post>`
      )
      .join("\n\n");

    if (profile.tweets.length === 0) {
      logger.info(
        { username: cleanUsername },
        "User has no tweets to analyze."
      );
      return {
        lawfulChaotic: 0,
        goodEvil: 0,
        explanation: `User @${cleanUsername} has no public tweets that could be analyzed.`,
        cached: false,
        isError: true, // Or treat as neutral if desired
      };
    }

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: dedent`
        You are an expert D&D alignment analyst. Analyze the provided Twitter user profile and their recent tweets to determine their alignment on a D&D-style chart.

        Lawful-Chaotic Axis:
        - Lawful (-100 to -34): Values order, rules, tradition, hierarchy. Predictable, reliable.
        - Neutral (-33 to 33): Balances rules and freedom. Pragmatic.
        - Chaotic (34 to 100): Values freedom, individuality, rebels against convention. Unpredictable.

        Good-Evil Axis:
        - Good (-100 to -34): Altruistic, compassionate, helps others, values life and dignity.
        - Neutral (-33 to 33): Concerned with self but not overtly harmful or helpful.
        - Evil (34 to 100): Selfish, harms others, manipulative, power-hungry, disregards others' well-being.

        Based ONLY on the provided profile and tweets:
        1.  Provide a numerical score for Lawful/Chaotic (-100 to 100).
        2.  Provide a numerical score for Good/Evil (-100 to 100).
        3.  Provide a brief (1-2 sentences) explanation for your scores, citing tweet content or profile bio if relevant.

        Be nuanced but decisive. If traits are subtle, lean towards neutral on that axis unless clear evidence pushes to an extreme.
        This is for fun, so be a bit playful in the explanation if appropriate, but keep the scores grounded in the text.
        Do not invent information not present in the tweets or profile.
        Output ONLY the JSON object as specified by the schema.
      `.trim(),
      },
      {
        role: "user",
        content: dedent`Username: @${cleanUsername}

<user_profile>
${profile_str_for_ai}
</user_profile>

<user_tweets limit="top_50_recent">
${tweetTexts}
</user_tweets>

Please provide your analysis.`.trim(),
      },
    ];

    const {
      object: analysisResult,
      usage,
      finishReason,
    } = await generateObject({
      model: google("gemini-1.5-flash-latest"), // Or "gemini-1.5-pro-latest" for higher quality
      temperature: 0.5, // Lower temp for more deterministic/factual analysis
      schema: AlignmentSchema,
      messages,
      // maxTokens: 250, // Optional: If you want to control output length more strictly
    });

    logger.info(
      { username: cleanUsername, usage, finishReason },
      "Gemini analysis complete"
    );

    await setCachedData(cacheKey, analysisResult, 604_800); // Cache for 7 days

    // waitUntil(track("analysis_complete", { // If using Vercel Analytics
    //   username: cleanUsername,
    //   lawful_chaotic: analysisResult.lawfulChaotic,
    //   good_evil: analysisResult.goodEvil,
    // }));

    return { ...analysisResult, cached: false, isError: false };
  } catch (error) {
    logger.error(
      { err: error, username: cleanUsername },
      `Error analyzing tweets for @${cleanUsername}`
    );
    let errorMessage = `Error analyzing tweets for @${cleanUsername}. Please check the username and try again later.`;

    if (error instanceof Error) {
      if (error.message.includes("API key not valid")) {
        errorMessage =
          "AI service API key is invalid or missing. Please contact support.";
      } else if (error.message.toLowerCase().includes("quota")) {
        errorMessage = "AI service quota exceeded. Please try again later.";
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
