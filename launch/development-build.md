# Getting off Expo Go

A development build is a real app, signed and installed on the phone, that
loads your JavaScript from the same `npx expo start` you already use. It is not
a step towards the App Store so much as a step out of a corner: Expo Go cannot
receive push notifications at all since SDK 53, and every native library has to
match the exact version Expo Go happens to ship, which has already cost this
project two startup crashes.

Once this is done: push works, `expo-notifications` behaves, and the whole
"installed but wrong version" class of problem disappears.

---

## What it costs

**Android: free.** EAS builds it on their servers, you download an APK and
install it.

**iOS: needs the Apple Developer Program, 149 AUD a year.** There is no way
around this for running on a real iPhone. A free Apple ID can only sign a build
for seven days through Xcode, and the iOS Simulator (which EAS will build for
free) cannot receive push notifications at all, so it does not test the thing
this is for.

You need the membership before launch regardless. This just brings it forward.

---

## Before you start

Have the two Supabase values to hand, from `mobile/.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Both are already public -- they ship inside the app binary and anyone who
downloads it can read them -- so they go in as plain EAS variables rather than
secrets. The service role key is the one that must never leave Supabase.

---

## 1. Log in and create the project

```
cd ~/Documents/untangled-life/mobile
npx eas-cli login
npx eas-cli init
```

`init` creates the project on Expo's side and writes `extra.eas.projectId` into
`app.json`. **That id is what push registration has been waiting for** -- until
it exists, `registerForPushNotifications` silently does nothing by design.

Commit `app.json` afterwards.

## 2. Give the build the Supabase values

EAS builds from what git tracks, and `mobile/.env` is gitignored, so the build
machine cannot see it. Without this step the app builds fine and then cannot
reach Supabase at all.

```
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "<the url from mobile/.env>" \
  --visibility plaintext \
  --environment development --environment preview --environment production

npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "<the anon key from mobile/.env>" \
  --visibility plaintext \
  --environment development --environment preview --environment production
```

Check with `npx eas-cli env:list`.

## 3. Build

**Android**, if you have an Android phone to hand:

```
npx eas-cli build --profile development --platform android
```

**iOS**, once the Apple Developer membership is active:

```
npx eas-cli build --profile development --platform ios
```

It will ask to log in to Apple and offer to handle signing. Say yes to letting
it manage credentials -- doing it by hand is a afternoon of provisioning
profiles for no benefit.

It also needs each iPhone registered:

```
npx eas-cli device:create
```

That produces a link or QR code. Open it **on each phone** -- yours and
Alyssa's -- and install the profile it offers. A phone that is not registered
cannot install the build, and the error when it fails says nothing useful.

Build takes 10-25 minutes. You get a link; open it on the phone and install.

## 4. Run against it

```
npx expo start --dev-client --clear
```

Open the new Untangled Life app rather than Expo Go, and scan or enter the URL.
Everything else works the way it does now.

## 5. Then push

The development build is only half of push. The rest, in
`supabase/functions/README.md`:

- deploy the `notify-partner` Edge Function
- add the three database webhooks
- `npx eas-cli credentials` to set up FCM (Android) and APNs (iOS)

Test it by booking a date on one phone and watching the other.

---

## Worth knowing

**Expo Go stops being useful.** Once the app has native modules Expo Go does
not ship, it will not run there. That is the trade, and it is the right one.

**Rebuild only when native code changes.** Adding a JS dependency, changing a
screen, editing copy: no rebuild, the dev client picks it up from Metro.
Adding a native module, changing `app.json` permissions or plugins: rebuild.

**The 100-account Google cap is unrelated.** That is the OAuth work in
`google-cloud-setup.md`, and it can run in parallel with all of this.
