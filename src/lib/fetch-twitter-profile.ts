// src/lib/fetch-twitter-profile.ts
"use server";

import { z } from "zod";
// parseExaUserString is your existing parser that expects a specific text block format.
// We'll try to use it first, but might need to switch if twitter_search gives structured data.
import { parseExaUserString, XProfile } from "@/lib/parse-exa-profile";
import { logger } from "@/lib/logger";

// --- Schema for Exa MCP twitter_search response ---
// This is a GENERIC ASSUMPTION. The actual structure from `twitter_search`
// might be much richer and provide more specific fields for profiles and tweets.
// You MUST inspect the actual API response to refine this schema if you switch to direct mapping (Strategy 2).
const ExaTwitterSearchResultSchema = z.object({
  id: z.string(), // ID of the result (e.g., tweet ID, or a unique ID for the result item)
  url: z.string().url(), // URL to the tweet, profile, or related content
  title: z.string().optional(), // Often contains "User on X: Tweet text" or similar
  author: z.string().optional(), // Username or display name associated with the content
  publishedDate: z.string().optional(), // ISO date string for the content's publication
  text: z.string(), // The main text content. For tweets, this might be the tweet itself.
  // For profiles, it might be a summary.
  // !!! IMPORTANT: POTENTIAL EXTRA STRUCTURED FIELDS !!!
  // The `twitter_search` tool might return MUCH more structured data directly.
  // For example, it could have nested objects or direct fields like:
  // screen_name: z.string().optional(),
  // user_bio: z.string().optional(),
  // followers: z.number().optional(),
  // tweet_content: z.string().optional(), // if `text` is something else
  // likes_count: z.number().optional(),
  // retweets_count: z.number().optional(),
});

const ExaMCPTwitterSearchResponseSchema = z.object({
  results: z.array(ExaTwitterSearchResultSchema),
  // Other potential top-level fields from Exa MCP might exist (e.g., requestId)
});

export async function fetchTwitterProfile(
  username: string
): Promise<XProfile | null> {
  if (!username) return null;
  const cleanUsername = username.trim().replace(/^@/, "");

  // This is the URL for your locally running Exa MCP server with the twitter_search tool.
  // Ensure `npx exa-mcp-server --tools=twitter_search` is running.
  const mcpServerUrl = "http://localhost:4891/tools/twitter_search";

  try {
    logger.info(
      { username: cleanUsername },
      `Fetching Twitter profile for @${cleanUsername} via Exa MCP twitter_search tool`
    );

    // Construct the query for the twitter_search tool.
    // Consult Exa's documentation for the `twitter_search` tool's specific query capabilities.
    // You might be able to ask for profile info explicitly, number of tweets, etc.
    const requestBody = {
      query: `from:${cleanUsername}`, // Basic query to get content from the user
      // Potentially add more parameters based on the tool's documentation:
      // e.g., include_profile: true, count: 20,
    };

    const response = await fetch(mcpServerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add 'x-api-key' or other auth headers if your local MCP server is configured to require them.
        // e.g., "x-api-key": process.env.EXA_API_KEY || "" // If needed for MCP
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: unknown = errorText;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        /* Not JSON, stick with text */
      }

      logger.error(
        {
          username: cleanUsername,
          status: response.status,
          errorResponse: parsedError,
          requestBody: requestBody,
        },
        `Exa MCP twitter_search API error`
      );
      throw new Error(
        `Exa MCP twitter_search API error: ${response.status} - ${errorText}`
      );
    }

    const rawData = await response.json();
    // !!! CRITICAL LOGGING STEP !!!
    // Carefully inspect this log output in your console to understand the exact structure
    // of the data returned by the `twitter_search` tool.
    logger.debug(
      { username: cleanUsername, rawDataFromExaMCP: rawData },
      "Received raw data from Exa MCP twitter_search. !!! INSPECT THIS LOG CAREFULLY to choose parsing strategy !!!"
    );

    const validatedResponse =
      ExaMCPTwitterSearchResponseSchema.safeParse(rawData);

    if (!validatedResponse.success) {
      logger.error(
        {
          username: cleanUsername,
          validationErrors: validatedResponse.error.issues,
          rawDataSnippet: JSON.stringify(rawData).substring(0, 500), // Log part of raw data
        },
        "Exa MCP twitter_search response validation error. Check rawData and compare with ExaTwitterSearchResultSchema."
      );
      return null;
    }

    if (validatedResponse.data.results.length === 0) {
      logger.warn(
        { username: cleanUsername, requestBody },
        `No results found for @${cleanUsername} from Exa MCP twitter_search.`
      );
      return null;
    }

    // --- CHOOSE YOUR PARSING STRATEGY BASED ON `rawDataFromExaMCP` ---

    // STRATEGY 1: Concatenate 'text' fields and use existing `parseExaUserString`
    // This assumes `parseExaUserString` can make sense of the combined text.
    // This is often less reliable if `twitter_search` provides structured data.

    logger.info(
      { username: cleanUsername },
      "Attempting STRATEGY 1: Concatenate text and use parseExaUserString."
    );
    const combinedText = validatedResponse.data.results
      .map((result) => result.text) // Assumes 'text' field is the primary content to parse
      .join("\n\n<---EXA_RESULT_SEPARATOR--->\n\n"); // Use a very distinct separator

    if (!combinedText.trim()) {
      logger.warn(
        { username: cleanUsername },
        `Combined text from Exa MCP twitter_search results (Strategy 1) is empty.`
      );
      // return null; // Decide if this is an error or if Strategy 2 should be tried
    }

    const parsedOutputStrategy1 = parseExaUserString(combinedText);

    if (
      parsedOutputStrategy1.success &&
      parsedOutputStrategy1.data &&
      (parsedOutputStrategy1.data.tweets.length > 0 ||
        parsedOutputStrategy1.data.bio)
    ) {
      logger.info(
        {
          username: cleanUsername,
          tweetCount: parsedOutputStrategy1.data.tweets.length,
          hasBio: !!parsedOutputStrategy1.data.bio,
        },
        `Successfully parsed profile data for @${cleanUsername} using STRATEGY 1 (parseExaUserString)`
      );
      return parsedOutputStrategy1.data;
    } else {
      logger.warn(
        {
          username: cleanUsername,
          error: parsedOutputStrategy1.error,
          // first500CharsOfInput: combinedText.substring(0, 500) // Log part of the input for debugging
        },
        "STRATEGY 1 (parseExaUserString) failed or yielded no data. The format from twitter_search might be incompatible. Consider STRATEGY 2."
      );
    }

    // STRATEGY 2: Direct Mapping (If Exa `twitter_search` provides structured data)
    // If `rawDataFromExaMCP` log shows structured data (e.g., separate fields for
    // bio, followers, tweet content, tweet dates), DO NOT rely on `parseExaUserString`.
    // Instead, enable and adapt the code below.

    /*
    logger.info({ username: cleanUsername }, "Attempting STRATEGY 2: Direct mapping from Exa MCP results.");
    const profileData: XProfile = {
      name: cleanUsername, // Default, try to find better from results
      tweets: [],
      // Initialize other XProfile fields as undefined or default
      bio: undefined,
      profile_url: undefined,
      created_at: undefined,
      followers_count: undefined,
      statuses_count: undefined,
      location: undefined,
    };
    let profileInfoExtractedFromOneResult = false;

    for (const result of validatedResponse.data.results) {
      // !!! YOU MUST ADAPT THIS LOGIC BASED ON THE ACTUAL `result` STRUCTURE !!!
      // How do you distinguish a "profile summary" result from a "tweet" result?
      // - Does it have a specific `type` field?
      // - Does the `result.url` point to the main profile vs. a status URL?
      // - Does one result contain fields like `user_bio`, `followers_count`?

      // HYPOTHETICAL: Assuming the first result might be profile-like or contains some profile info
      if (!profileInfoExtractedFromOneResult) {
        // Try to intelligently guess profile info from a result
        // This is highly dependent on Exa's output structure
        profileData.name = result.author || result.title?.split(' on X:')[0] || cleanUsername; // Example
        profileData.profile_url = result.url.includes('/status/') ? undefined : result.url;

        // If `result.text` for a profile-like entry is what `parseExaUserString` expects for profile block:
        // const tempProfileParse = parseExaUserString(result.text);
        // if (tempProfileParse.success && tempProfileParse.data) {
        //    profileData.bio = tempProfileParse.data.bio;
        //    profileData.followers_count = tempProfileParse.data.followers_count;
        //    // ... copy other relevant fields
        //    profileInfoExtractedFromOneResult = true;
        // }
        // OR if structured fields exist directly in `result`:
        // profileData.bio = result.user_bio; // e.g., if result.user_bio exists
        // profileData.followers_count = result.followers; // e.g., if result.followers exists
        // if (profileData.bio) profileInfoExtractedFromOneResult = true;
      }

      // HYPOTHETICAL: Assuming results with '/status/' in URL are tweets, or all results are tweets
      if (result.url.includes('/status/')) { // Or some other indicator that it's a tweet
        const tweet: Tweet = {
          text: result.text, // Or a more specific field like `result.tweet_actual_content`
          created_at: result.publishedDate || new Date().toISOString(),
          // Metrics might be directly available or need calculation/defaulting
          favorite_count: 0, // Placeholder - look for `result.likes_count` etc.
          retweet_count: 0,  // Placeholder
          reply_count: 0,    // Placeholder
          quote_count: 0,    // Placeholder
          is_quote_status: false, // Placeholder
        };
        profileData.tweets.push(tweet);
      }
    }

    if (profileData.tweets.length > 0 || profileInfoExtractedFromOneResult) {
        logger.info(
            {
                username: cleanUsername,
                tweetCount: profileData.tweets.length,
                hasBio: !!profileData.bio,
            },
            `Successfully processed profile data for @${cleanUsername} using STRATEGY 2 (Direct Mapping)`
        );
        return profileData;
    } else {
        logger.warn({ username: cleanUsername }, "STRATEGY 2 (Direct Mapping) did not yield actionable profile or tweet data.");
        return null;
    }
    */

    // If neither strategy worked, return null
    logger.error(
      { username: cleanUsername },
      "Both parsing strategies failed or yielded no useful data."
    );
    return null;
  } catch (error) {
    logger.error(
      { err: error, username: cleanUsername },
      `Critical error in fetchTwitterProfile for @${cleanUsername} using Exa MCP twitter_search tool`
    );
    return null;
  }
}
