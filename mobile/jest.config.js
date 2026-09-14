// The test timezone, set here rather than in a setup file.
//
// It has to happen in THIS process, before Jest forks its workers. A setup
// file looked right and did nothing: inside a test the `process.env` object is
// Jest's own copy, so assigning TZ there never reaches Node and never
// invalidates the timezone it has already cached. The suite ran in UTC while
// claiming to run in New York, which quietly made every daylight-saving test
// meaningless -- they pass under a fixed offset whether the code measures
// wall-clock time or elapsed time, which is the exact distinction they exist
// to protect.
//
// New York is used rather than Sydney so the transitions don't coincide with
// the dates the other suites use.
process.env.TZ = "America/New_York";

module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  setupFiles: ["<rootDir>/jest.setup.js"],
};
