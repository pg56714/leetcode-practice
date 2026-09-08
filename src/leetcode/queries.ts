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

/**
 * One study plan with its groups and problems.
 *
 * Note the shape mismatches with the problem set: `difficulty` comes back upper
 * case here, and `status` is "TO_DO" or "PAST_SOLVED" rather than null or "ac".
 * Also `paidOnly`, not `isPaidOnly`.
 */
export const STUDY_PLAN_DETAIL = `
  query studyPlanDetail($slug: String!) {
    studyPlanV2Detail(planSlug: $slug) {
      slug
      name
      questionNum
      planSubGroups {
        name
        questions {
          questionFrontendId
          title
          titleSlug
          difficulty
          status
          paidOnly
        }
      }
    }
  }
`;

/** Contests that have not started yet. Takes no arguments. */
export const UPCOMING_CONTESTS = `
  query upcomingContests {
    upcomingContests {
      title
      titleSlug
      startTime
      duration
    }
  }
`;

/**
 * The reader's own problem lists.
 *
 * This is the listing query that study plans lack: created lists are the ones
 * they made, collected are the ones they saved. Slugs are opaque hashes.
 */
export const FAVOURITE_LISTS = `
  query myFavouriteLists {
    myCreatedFavoriteList {
      favorites {
        name
        slug
        questionNumber
      }
    }
    myCollectedFavoriteList {
      favorites {
        name
        slug
        questionNumber
      }
    }
  }
`;

/**
 * The problems in one list.
 *
 * Paged like the problem set, and `hasMore` rather than a total to compare
 * against. Study plan slugs do not work here — a plan is not a list.
 */
export const FAVOURITE_QUESTIONS = `
  query favouriteQuestions($favoriteSlug: String!, $limit: Int, $skip: Int) {
    favoriteQuestionList(
      favoriteSlug: $favoriteSlug
      filter: { positionRoleTagSlug: "", skip: $skip, limit: $limit }
    ) {
      totalLength
      hasMore
      questions {
        questionFrontendId
        title
        titleSlug
        difficulty
        status
        paidOnly
      }
    }
  }
`;

/** Contests that have already run. 700-plus of them, so it pages. */
export const PAST_CONTESTS = `
  query pastContests($pageNo: Int, $numPerPage: Int) {
    pastContests(pageNo: $pageNo, numPerPage: $numPerPage) {
      totalNum
      data {
        title
        titleSlug
        startTime
        duration
      }
    }
  }
`;

/**
 * One contest and its problems.
 *
 * Contest questions carry `credit` (the points they were worth) and the
 * internal `questionId`, but no frontend number and no difficulty — those come
 * from the problem itself when it is opened.
 */
export const CONTEST_QUESTIONS = `
  query contest($slug: String!) {
    contest(titleSlug: $slug) {
      title
      startTime
      duration
      questions {
        title
        titleSlug
        credit
      }
    }
  }
`;

/**
 * Community solutions for a problem, most upvoted first.
 *
 * `orderBy` is an enum whose values are lower case literals — `most_votes`,
 * not MOST_VOTES — which is unusual enough to be worth stating. `voteCount`
 * lives on the post rather than the topic.
 */
export const SOLUTION_LIST = `
  query questionSolutions($slug: String!, $first: Int!) {
    questionSolutions(filters: { questionSlug: $slug, first: $first, skip: 0, orderBy: most_votes }) {
      totalNum
      solutions {
        id
        title
        commentCount
        viewCount
        post {
          voteCount
          creationDate
          author {
            username
          }
        }
      }
    }
  }
`;

/**
 * One solution with its body.
 *
 * The body is Markdown, but escaped: newlines arrive as backslash-n. See
 * unescapePost.
 */
export const SOLUTION_ARTICLE = `
  query topic($id: Int!) {
    topic(id: $id) {
      id
      title
      commentCount
      viewCount
      post {
        content
        voteCount
        creationDate
        author {
          username
        }
      }
    }
  }
`;
