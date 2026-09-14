// Pin the test timezone to one that observes daylight saving.
//
// The day-grid tests need a real DST transition to be meaningful: under a
// fixed-offset zone (which is what CI and the sandbox default to) they pass
// whether the code measures wall-clock time or elapsed time, which is exactly
// the distinction they exist to protect. New York is used rather than Sydney
// so the transitions don't coincide with the dates the other suites use.
//
// setupFiles runs before the test framework and before any module under test
// is imported, which is what makes the change take effect.
process.env.TZ = "America/New_York";
