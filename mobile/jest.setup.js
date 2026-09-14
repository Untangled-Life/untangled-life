// The timezone itself is set in jest.config.js, which runs early enough to
// matter. This only checks that it worked: a suite silently running in UTC
// passes its daylight-saving tests without testing anything, which is worse
// than not having them.
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

if (zone !== "America/New_York") {
  throw new Error(
    `Tests expect to run in America/New_York, but this process is in ${zone}. ` +
      "The DST tests are meaningless under a fixed-offset zone. Run with TZ=America/New_York."
  );
}
