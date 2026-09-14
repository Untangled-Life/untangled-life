# The night of 14-15 September

Everything below is pushed. Revert point: `git reset --hard pre-overnight-15sep`
(commit `117c47c`). Every feature is its own commit, so you can drop any one of
them instead.

---

## Run these first, in this order

Nothing in the app breaks if you have not run them. The features just do not
light up, and the walkthrough will error when it tries to write.

1. `supabase/onboarding.sql` -- two columns on `profiles`
2. `supabase/date-proposals.sql` -- proposing a date
3. `supabase/feeling-valued.sql` -- the questionnaire
4. `supabase/date-history.sql` -- how was it
5. `supabase/valued-index.sql` -- one index
6. **`supabase/leaving.sql` again** -- it now cleans up the three new tables
   when somebody unpairs, and it has to run after they exist

Also still outstanding from yesterday: `supabase/date-nudge.sql`, if you have
not run it.

I executed 1 to 5 against a real Postgres 16, twice each for re-runnability,
and exercised the logic with real rows: the proposal accept paths (own
proposal, nonexistent option, already answered, stranger), the questionnaire
RLS (unshared invisible, shared visible, partner cannot edit), and the review
functions (old date excluded, repeat excluded, rating stops asking you but not
your partner, one person changing their mind removes it from both-loved).

Number 6 I could not execute, because it needs the real schema. Read it before
running it if you want to be careful.

---

## What is new

**The walkthrough** (`/welcome`). Five steps, everything skippable, and a new
couple lands on it once. Working hours offers "I work regular hours" as well as
the roster builder, because sending somebody whose answer is nine to five into
a rotating-cycle builder is why that step gets skipped.

**The bell**, beside the calendar icon. Holds anything skipped during setup, a
date proposal waiting on you, a key date inside its own reminder window, the
fortnight nudge, and the how-was-it. Ordered by what it costs to ignore.
Proposals and reviews are answered where they sit.

**Plan a date** (`/plan`). Twenty-three ideas, filtered to what fits the gaps
you actually have. Book it, or offer two or three times and wait.

**Feeling valued** (`/valued`, from the menu). Five ways ranked, three written
questions. Nothing reaches your partner until you turn sharing on, which the
database enforces rather than the app. Their words turn up at the bottom of
Home.

**How was it.** Asked once after a date, never again. Both saying "loved" puts
it in "You both loved these" at the top of the ideas screen.

---

## Worth checking tonight, in this order

The whole walkthrough is the thing I could not test at all, because it runs
once per account and I cannot make a second one.

- [ ] Sign up a fresh test account and pair it. Do you land on the walkthrough?
- [ ] Skip every step, then tap "Take me in". Do you reach Home, and is the
      bell showing five?
- [ ] Force-quit and reopen. Are you left alone, or sent back to the
      walkthrough? (`onboarded_at` is what stops it. If it sends you back, the
      write failed and you should see an alert rather than nothing.)
- [ ] Go through it properly instead. Does each photo step tick once the photo
      lands, and does the picture appear? This one was broken and is the fix I
      am least sure of.
- [ ] "I work regular hours", pick some days and hours, save. Then open Working
      hours from Settings. Is the roster there and does it look right?
- [ ] Plan a date, tap "Ask Alyssa" on something. Does it reach her bell? Does
      accepting put it in both calendars at the IDEA'S length rather than the
      length of the free window?
- [ ] Answer the questionnaire with sharing OFF. Check she cannot see it. Turn
      it on, check she can, and check the line at the bottom of her Home.
- [ ] Book something for an hour ago, then open the bell. Does it ask how it
      was? Rate it. Does it stop asking you and keep asking her?

---

## Two things I did not do

**Eslint has 29 errors**, and nobody has been running it. Thirty-two before
tonight; tonight's files are clean. They are nearly all the new React compiler
rules objecting to patterns that work fine today, so this is a morning's tidy
rather than a bug hunt, but it should go in the test script.

**The bell does not clear itself when you act from elsewhere.** Add your photo
from Settings and the bell keeps the step until the next focus. Cheap to fix,
but it needed a decision about where the refresh lives and you were asleep.
