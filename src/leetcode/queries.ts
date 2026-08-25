/**
 * GraphQL documents sent to leetcode.com.
 *
 * Field names are dictated by LeetCode's schema; the shape of each document is
 * kept as small as the UI needs, so a listing never pulls a problem body.
 */

export const USER_STATUS = `
  query userStatus {
    userStatus {
      isSignedIn
      isPremium
      username
    }
  }
`;

export const DAILY_CHALLENGE = `
  query dailyChallenge {
    activeDailyCodingChallengeQuestion {
      date
      question {
        questionFrontendId
        title
        titleSlug
        difficulty
        isPaidOnly
        status
      }
    }
  }
`;
