/* eslint-env node */
module.exports = {
  testMatch: ["**/+(*.)+(spec).+(ts)"],
  collectCoverage: true,
  coverageReporters: ["html", "lcov"],
  coverageDirectory: "coverage",

  // Workaround for a memory leak that crashes tests in CI:
  // https://github.com/facebook/jest/issues/9430#issuecomment-1149882002
  // Also anecdotally improves performance when run locally
  maxWorkers: 3,

  globals: {
    "ts-jest": {
      // Jest does not use tsconfig.spec.json by default
      tsconfig: "<rootDir>/tsconfig.spec.json",
      // Further workaround for memory leak, recommended here:
      // https://github.com/kulshekhar/ts-jest/issues/1967#issuecomment-697494014
      // Makes tests run faster and reduces size/rate of leak, but loses typechecking on test code
      // See https://bitwarden.atlassian.net/browse/EC-497 for more info
      isolatedModules: true,
    },
  },
};
