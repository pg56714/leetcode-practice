/**
 * GraphQL documents sent to leetcode.com.
 *
 * Field names are dictated by LeetCode's schema; each document is kept as small
 * as the UI needs, so a listing never drags a problem body along with it.
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

/**
 * One page of the problem set.
 *
 * LeetCode caps a page at 100 rows no matter what `limit` asks for, so callers
 * page with `skip` and use `total` to know when to stop.
 */
export const PROBLEM_PAGE = `
  query problemsetQuestionList($limit: Int, $skip: Int) {
    problemsetQuestionList: questionList(categorySlug: "", limit: $limit, skip: $skip, filters: {}) {
      total: totalNum
      questions: data {
        questionFrontendId
        title
        titleSlug
        difficulty
        isPaidOnly
        status
        acRate
      }
    }
  }
`;

/**
 * Everything needed to start working on one problem.
 *
 * `metaData` is a JSON string whose `params` array length is how many lines one
 * test case occupies — the only reliable source for splitting test input.
 */
export const QUESTION_DETAIL = `
  query questionDetail($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      questionFrontendId
      title
      titleSlug
      content
      difficulty
      isPaidOnly
      sampleTestCase
      exampleTestcases
      metaData
      codeSnippets {
        lang
        langSlug
        code
      }
      topicTags {
        name
        slug
      }
    }
  }
`;
