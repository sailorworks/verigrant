// src/lib/parse-exa-profile.ts
export interface ExaApiResponse {
  data: {
    // Note: The provided example sometimes had data directly, sometimes nested. Adjust if Exa's live API differs.
    results: ExaResult[];
    requestId: string;
    costDollars: {
      total: number;
      contents: {
        text: number;
      };
    };
  };
}

export interface ExaResult {
  id: string;
  title: string;
  url: string;
  publishedDate: string;
  author: string;
  text: string;
}

export type Tweet = {
  text: string;
  created_at: string;
  favorite_count: number;
  quote_count: number;
  reply_count: number;
  retweet_count: number;
  is_quote_status?: boolean;
};

export type XProfile = {
  tweets: Tweet[];
  bio?: string;
  profile_url?: string;
  name?: string;
  created_at?: string;
  followers_count?: number;
  statuses_count?: number;
  location?: string;
};

// This parser is highly dependent on the exact string format from Exa.
// It might need adjustments if Exa changes its output format.
export const parseExaUserString = (
  raw_string: string
): { success: boolean; data?: XProfile; error?: unknown } => {
  try {
    const composed_object: XProfile = {
      tweets: [],
    };
    const base_yml = raw_string;

    // Attempt to split profile info from tweets. This is heuristic.
    const profile_end_marker = "statuses_count:"; // Or another reliable marker
    const profile_end_index = base_yml.indexOf(profile_end_marker);

    let profile_yml = "";
    let tweets_yml = base_yml;

    if (profile_end_index !== -1) {
      // Find the end of the line for statuses_count to include its value
      const end_of_line_index = base_yml.indexOf("\n", profile_end_index);
      profile_yml = base_yml
        .substring(
          0,
          end_of_line_index !== -1 ? end_of_line_index : base_yml.length
        )
        .trim();
      tweets_yml = base_yml
        .substring(
          end_of_line_index !== -1 ? end_of_line_index : base_yml.length
        )
        .replace("| location:", "")
        .trim();
    } else {
      // Fallback if marker isn't found, assume less structured data or primarily tweets
      // This part might need more robust logic based on actual Exa output variations
    }

    const PROFILE_PATTERNS = {
      bio: /^(.*?)(?=\| (?:profile_url:|name:|created_at:|followers_count:|favourites_count:|friends_count:|media_count:|statuses_count:|location:))/,
      profile_url: /\| profile_url:\s*([^\s|]+)/,
      name: /\| name:\s*([^|]+)/,
      created_at: /\| created_at:\s*([^|]+)/,
      followers_count: /\| followers_count:\s*(\d+)/,
      statuses_count: /\| statuses_count:\s*(\d+)/,
      location: /\| location:\s*([^|]+)/,
    } as const;

    const num_keys = [
      "followers_count",
      "favourites_count",
      "friends_count",
      "media_count",
      "statuses_count",
      "favorite_count",
      "quote_count",
      "reply_count",
      "retweet_count",
    ];

    for (const [key, pattern] of Object.entries(PROFILE_PATTERNS)) {
      const match = profile_yml?.match(pattern);
      if (match && match[1]) {
        Object.assign(composed_object, {
          [key]: num_keys.includes(key)
            ? parseInt(match[1].trim())
            : match[1].trim().replace(/^["']|["']$/g, ""),
        });
      }
    }
    // Split tweets based on a common delimiter, e.g., a pattern indicating start of a new tweet
    // The original used `| lang: ...`, this might need adjustment
    const tweet_delimiters = tweets_yml.split(/\| created_at:/).slice(1); // Assuming each tweet starts with | created_at:

    const TWEET_PATTERNS = {
      // created_at is used for splitting, so it's implicitly the start
      favorite_count: /favorite_count:\s*(\d+)/,
      quote_count: /quote_count:\s*(\d+)/,
      reply_count: /reply_count:\s*(\d+)/,
      retweet_count: /retweet_count:\s*(\d+)/,
      is_quote_status: /is_quote_status:\s*(True|False)/,
      // Text is often the remaining part after metadata
    } as const;

    for (const tweet_block of tweet_delimiters) {
      const full_tweet_data_string = "| created_at:" + tweet_block; // Re-add the delimiter for parsing
      const tweet_object: Partial<Tweet> = {};

      const createdAtMatch = full_tweet_data_string.match(
        /created_at:\s*([^|]+)/
      );
      if (createdAtMatch && createdAtMatch[1])
        tweet_object.created_at = createdAtMatch[1].trim();

      for (const [key, pattern] of Object.entries(TWEET_PATTERNS)) {
        const match = full_tweet_data_string.match(pattern);
        if (match && match[1]) {
          if (key === "is_quote_status") {
            Object.assign(tweet_object, { [key]: match[1].trim() === "True" });
          } else {
            Object.assign(tweet_object, {
              [key]: num_keys.includes(key)
                ? parseInt(match[1].trim())
                : match[1].trim().replace(/^["']|["']$/g, ""),
            });
          }
        }
      }

      // Extract tweet text: assume it's before the first metadata field or after all recognized fields.
      // This is the trickiest part and highly dependent on Exa's format.
      // A common approach: text is what's left after removing known patterns.
      // Or, if text is consistently at the start before `| created_at:`, handle that.
      // For this example, let's assume text is the content before `| created_at:` if tweets_yml was split differently,
      // or it's extracted by removing known metadata fields from `full_tweet_data_string`.
      // Let's try to find text as what's before the first `| field:`
      const textMatch = full_tweet_data_string.match(/^([^|]+)/);
      if (textMatch && textMatch[1] && textMatch[1].trim().length > 0) {
        tweet_object.text = textMatch[1].trim();
      } else {
        // Fallback or more complex extraction for text
        // e.g. text is after is_quote_status: and before | lang:
        const textAfterMetaMatch = full_tweet_data_string.match(
          /is_quote_status:\s*(?:True|False)\s*([^|]+)/
        );
        if (textAfterMetaMatch && textAfterMetaMatch[1]) {
          tweet_object.text = textAfterMetaMatch[1].trim();
        } else {
          tweet_object.text = "Could not parse tweet text"; // Placeholder
        }
      }

      if (tweet_object.text && tweet_object.created_at) {
        // Ensure essential fields are present
        composed_object.tweets.push(tweet_object as Tweet);
      }
    }

    composed_object.tweets = composed_object.tweets.filter(
      (tweet) =>
        tweet.text &&
        tweet.text.length > 0 &&
        tweet.text !== "Could not parse tweet text"
    );

    return { success: true, data: composed_object };
  } catch (error) {
    console.error("Error in parseExaUserString:", error);
    return { success: false, error: error };
  }
};
