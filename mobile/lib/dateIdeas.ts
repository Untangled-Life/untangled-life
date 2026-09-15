import { Interval } from "@/lib/freeTime";
import type { ValuedWay } from "@/lib/valued";

/**
 * Date ideas.
 *
 * The reason couples do not plan anything is rarely that they cannot find a
 * time. It is the blank page: "what do you want to do" answered with "I don't
 * mind" by both people until the evening is gone. So this is a list, bundled
 * with the app rather than fetched, because an idea that needs a network call
 * is an idea that fails on the train.
 *
 * Deliberately not clever. No machine learning, no personalisation beyond the
 * filters below. A list somebody wrote is better than a list somebody
 * generated, and these have to survive being read hundreds of times.
 */

/**
 * Four categories on the screen, two more as tags.
 *
 * At home, Going out, Under $50 and Worth planning are the four buttons.
 * "active" and "new" are kept on the ideas as tags because they are useful
 * for telling ideas apart and for the little line of metadata under each
 * one, but six buttons was a filter panel and four is a choice.
 */
export type IdeaCategory = "in" | "out" | "cheap" | "big" | "active" | "new";

/** The two that are tags rather than buttons. */
export const TAGS: IdeaCategory[] = ["active", "new"];

export const CATEGORIES: { key: IdeaCategory; label: string; blurb: string }[] = [
  { key: "in", label: "At home", blurb: "No booking, no babysitter" },
  { key: "out", label: "Going out", blurb: "Somewhere that isn't the lounge" },
  { key: "cheap", label: "Under $50", blurb: "For the whole thing, both of you" },
  { key: "big", label: "Worth planning", blurb: "A proper night, or a whole day" },
];

export type DateIdea = {
  id: string;
  title: string;
  /** What it actually involves, in one line. */
  blurb: string;
  categories: IdeaCategory[];
  /** Minutes. Sets the length of the event when this becomes a plan. */
  minutes: number;
  /** Rough, and only used to filter. Null means it depends entirely. */
  cost: "free" | "low" | "mid" | "high" | null;
  /** Needs to be outdoors, so it is offered less in bad weather months. */
  outdoors?: boolean;
  /** Only makes sense after dark, or only in daylight. */
  timeOfDay?: "day" | "evening";
  /**
   * Which of the five ways of feeling valued this idea actually serves.
   *
   * This is what lets the list sort itself around what your partner said,
   * and it is tagged by hand rather than guessed from the words. A night
   * away is closeness and undivided attention; a ticket to the thing they
   * would never buy themselves is something thought of; the washing up done
   * together on a Sunday is an act. Most ideas are two of the five, and the
   * first one listed is the one it is mostly about.
   */
  ways: ValuedWay[];
};

export const IDEAS: DateIdea[] = [
  // ---------------------------------------------------------------- at home
  { id: "cook-together", title: "Cook something neither of you can cook", blurb: "Pick a recipe that scares you both a bit and make it together.", categories: ["in", "cheap", "new"], minutes: 150, cost: "low", timeOfDay: "evening", ways: ["time", "acts"] },
  { id: "no-phones-dinner", title: "Dinner with the phones in another room", blurb: "Same meal you were having anyway. The phones go in a drawer.", categories: ["in", "cheap"], minutes: 90, cost: "free", timeOfDay: "evening", ways: ["time"] },
  { id: "old-photos", title: "Go through your old photos together", blurb: "Start at the beginning. Plan for it to take longer than you think.", categories: ["in", "cheap"], minutes: 90, cost: "free", ways: ["time", "words"] },
  { id: "film-they-love", title: "The film they have been telling you to watch", blurb: "The one you have been putting off. Actually watch it, and no phone.", categories: ["in", "cheap"], minutes: 150, cost: "free", timeOfDay: "evening", ways: ["acts", "time"] },
  { id: "breakfast-in-bed", title: "Breakfast in bed, no reason", blurb: "Whoever wakes first. The other one is not allowed to help.", categories: ["in", "cheap"], minutes: 60, cost: "low", timeOfDay: "day", ways: ["acts", "gifts"] },
  { id: "learn-something", title: "Learn one thing together", blurb: "A card trick, a cocktail, three chords. One evening, one skill.", categories: ["in", "cheap", "new"], minutes: 90, cost: "free", timeOfDay: "evening", ways: ["time"] },
  { id: "plan-the-trip", title: "Plan a trip you cannot afford yet", blurb: "Pick a place, price it properly, decide what you would cut to get there.", categories: ["in", "cheap"], minutes: 90, cost: "free", ways: ["time"] },
  { id: "blanket-fort", title: "Build the fort", blurb: "Every cushion in the house, a sheet over the top, a film inside it.", categories: ["in", "cheap"], minutes: 120, cost: "free", timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "bath-no-clock", title: "A bath with no clock in the room", blurb: "Candles if you have them. The point is that nobody is timing it.", categories: ["in", "cheap"], minutes: 60, cost: "free", timeOfDay: "evening", ways: ["closeness"] },
  { id: "board-game-stakes", title: "A board game with real stakes", blurb: "Loser cooks Sunday. Loser does the bins for a month. Agree the stakes first.", categories: ["in", "cheap"], minutes: 90, cost: "free", timeOfDay: "evening", ways: ["time"] },
  { id: "massage-each", title: "Twenty minutes each, properly", blurb: "Shoulders, feet, whatever is sore. Set a timer so it is actually fair.", categories: ["in", "cheap"], minutes: 60, cost: "free", timeOfDay: "evening", ways: ["closeness", "acts"] },
  { id: "childhood-dinner", title: "Cook the dinner they grew up on", blurb: "Ring their mum for the recipe if you have to. Make it the way it was made.", categories: ["in", "cheap"], minutes: 120, cost: "low", timeOfDay: "evening", ways: ["acts", "gifts"] },
  { id: "letters-read-aloud", title: "Write each other a letter, then read it out", blurb: "Half an hour apart to write it. Then swap, and read it to them, out loud.", categories: ["in", "cheap"], minutes: 60, cost: "free", timeOfDay: "evening", ways: ["words"] },
  { id: "music-swap", title: "Five songs each, and why", blurb: "Take turns. Each song comes with the story of why it is on the list.", categories: ["in", "cheap"], minutes: 90, cost: "free", timeOfDay: "evening", ways: ["words", "time"] },
  { id: "backyard-campout", title: "Camp in the backyard", blurb: "A tent if you have one, blankets if you do not. Stay out until it is properly cold.", categories: ["in", "cheap", "active"], minutes: 720, cost: "free", outdoors: true, timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "slow-sunday", title: "A Sunday with nothing in it", blurb: "Pyjamas until noon, the paper, a second coffee. Guard it from plans.", categories: ["in", "cheap"], minutes: 240, cost: "free", timeOfDay: "day", ways: ["time", "closeness"] },
  { id: "jigsaw-weekend", title: "A thousand pieces, one weekend", blurb: "Leave it on the table all weekend. Drift back to it. Argue about the sky.", categories: ["in", "cheap"], minutes: 180, cost: "low", ways: ["time"] },
  { id: "fancy-dinner-home", title: "Restaurant dinner, in your own kitchen", blurb: "Courses, a tablecloth, dressed up for it. Nobody is allowed to clear up until tomorrow.", categories: ["in"], minutes: 150, cost: "mid", timeOfDay: "evening", ways: ["acts", "gifts"] },
  { id: "blind-tasting", title: "Three bottles, blind", blurb: "The bottle shop's cheapest, dearest and one in between. Guess which is which.", categories: ["in"], minutes: 120, cost: "mid", timeOfDay: "evening", ways: ["time"] },
  { id: "cinema-at-home", title: "Cinema night, done properly", blurb: "Lights off, real popcorn, the good blanket, phones in the other room until the credits.", categories: ["in", "cheap"], minutes: 150, cost: "low", timeOfDay: "evening", ways: ["time", "closeness"] },
  { id: "cook-the-week", title: "Cook the week's dinners together", blurb: "Music on, two chopping boards. Boring on your own and somehow not together.", categories: ["in", "cheap"], minutes: 150, cost: "low", ways: ["acts"] },
  { id: "plant-something", title: "Plant something you will actually eat", blurb: "Herbs on the windowsill count. So does a lemon tree you will wait three years for.", categories: ["in", "cheap", "active"], minutes: 120, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time", "acts"] },
  { id: "questions-deck", title: "The questions you have never asked", blurb: "A couples question deck, or the thirty-six questions. Skip none of them.", categories: ["in", "cheap"], minutes: 90, cost: "free", timeOfDay: "evening", ways: ["words", "time"] },
  { id: "bake-ridiculous", title: "Bake the ridiculous thing", blurb: "Croissants from scratch. A croquembouche. Something that takes all afternoon and might fail.", categories: ["in", "cheap", "new"], minutes: 240, cost: "low", timeOfDay: "day", ways: ["time"] },
  { id: "yes-day", title: "Their day, your yes", blurb: "They decide everything for a day, and you say yes. Swap next month.", categories: ["in", "cheap"], minutes: 480, cost: null, timeOfDay: "day", ways: ["acts", "time"] },
  { id: "read-same-room", title: "An hour of reading in the same room", blurb: "Separate books, same couch. It counts.", categories: ["in", "cheap"], minutes: 60, cost: "free", ways: ["closeness", "time"] },
  { id: "kitchen-dance", title: "One song in the kitchen", blurb: "Their song, then yours. It will be more than one song.", categories: ["in", "cheap"], minutes: 30, cost: "free", timeOfDay: "evening", ways: ["closeness"] },
  { id: "room-service", title: "Room service, at home", blurb: "Bed made hotel-tight, a tray, a little card. Dinner in bed for one of you, served by the other.", categories: ["in", "cheap"], minutes: 90, cost: "low", timeOfDay: "evening", ways: ["acts", "gifts"] },
  { id: "record-how-you-met", title: "Record how you met", blurb: "A voice memo, both of you, telling it. Disagree about the details. Keep it forever.", categories: ["in", "cheap"], minutes: 60, cost: "free", ways: ["words"] },
  { id: "fix-the-thing", title: "Fix the thing that has been broken for months", blurb: "The sticking door, the wobbly shelf. Together, with a beer, and no rush.", categories: ["in", "cheap"], minutes: 90, cost: "low", timeOfDay: "day", ways: ["acts"] },
  { id: "sunday-roast", title: "A roast that takes all afternoon", blurb: "Start at two. Eat at six. Everything in between is the date.", categories: ["in"], minutes: 240, cost: "low", timeOfDay: "day", ways: ["acts", "time"] },
  { id: "their-childhood-film", title: "The film they loved at ten", blurb: "Ask what it was. Find it. Watch it without saying a word about the effects.", categories: ["in", "cheap"], minutes: 120, cost: "free", timeOfDay: "evening", ways: ["gifts", "time"] },
  { id: "pancakes-competitive", title: "Pancakes, competitively", blurb: "One batter, two pans, a judge on video call. The loser washes up.", categories: ["in", "cheap"], minutes: 60, cost: "low", timeOfDay: "day", ways: ["time"] },
  { id: "family-recipe", title: "Learn the family recipe from the source", blurb: "Their mum, their nan, whoever holds it. On the phone, in the kitchen, following along.", categories: ["in", "cheap"], minutes: 120, cost: "low", ways: ["acts", "gifts"] },
  { id: "time-capsule", title: "A time capsule for the two of you", blurb: "A letter each, a photo, the receipt from dinner. Seal it. Open it in five years.", categories: ["in", "cheap"], minutes: 90, cost: "free", ways: ["words", "gifts"] },
  { id: "no-alarm", title: "A night with no alarm", blurb: "Clear the next morning. Whoever wakes first does not get up.", categories: ["in"], minutes: 600, cost: "free", timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "plan-anniversary", title: "Plan the anniversary now, not the week before", blurb: "An hour with a calendar and a budget. The actual day will thank you.", categories: ["in", "cheap"], minutes: 60, cost: "free", ways: ["acts"] },
  { id: "furniture-rescue", title: "Rescue a piece of furniture", blurb: "Op shop or roadside. Sand it, paint it, argue about the colour. Keep it forever.", categories: ["in", "cheap", "new"], minutes: 240, cost: "low", timeOfDay: "day", ways: ["acts", "time"] },
  { id: "ten-words", title: "Ten words in their family's language", blurb: "Or their nan's. Learn them properly, use one at dinner without warning.", categories: ["in", "cheap", "new"], minutes: 60, cost: "free", ways: ["words", "gifts"] },
  { id: "tea-and-talk", title: "Tea, the good cups, and the thing you have been meaning to say", blurb: "Not a hard conversation. Just the one that keeps getting bumped for the telly.", categories: ["in", "cheap"], minutes: 60, cost: "free", timeOfDay: "evening", ways: ["words", "time"] },

  // ------------------------------------------------------ going out, cheap
  { id: "walk-somewhere-new", title: "Walk somewhere neither of you has walked", blurb: "Pick a suburb on the map and just go and look at it.", categories: ["out", "cheap", "active", "new"], minutes: 120, cost: "free", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "coffee-and-nothing", title: "Coffee with nothing after it", blurb: "No shopping, no errands attached. Just sit down and talk.", categories: ["out", "cheap"], minutes: 60, cost: "low", timeOfDay: "day", ways: ["time", "words"] },
  { id: "sunset-somewhere", title: "Watch the sun go down somewhere", blurb: "Find the time it sets, be there twenty minutes before.", categories: ["out", "cheap", "active"], minutes: 90, cost: "free", outdoors: true, timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "markets", title: "The markets, early", blurb: "Go before it gets busy. Buy lunch, eat it there.", categories: ["out", "cheap", "active"], minutes: 150, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "op-shop-challenge", title: "Op shop, $20 each, best outfit wins", blurb: "One hour, twenty dollars, no consulting. Then dinner in what you picked.", categories: ["out", "cheap", "new"], minutes: 120, cost: "low", timeOfDay: "day", ways: ["gifts", "time"] },
  { id: "library-swap", title: "Each pick a book for the other", blurb: "Library or a second-hand shop. You have to actually read it.", categories: ["out", "cheap", "new"], minutes: 60, cost: "free", timeOfDay: "day", ways: ["gifts"] },
  { id: "swim-then-chips", title: "Swim, then hot chips", blurb: "Beach, river, pool. The chips are not optional.", categories: ["out", "cheap", "active"], minutes: 180, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time", "closeness"] },
  { id: "sunrise-walk", title: "Get up for the sunrise", blurb: "Set two alarms. Be somewhere with a view. Breakfast after.", categories: ["out", "cheap", "active", "new"], minutes: 150, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time", "closeness"] },
  { id: "bike-somewhere", title: "Ride somewhere for lunch", blurb: "Pick a place far enough that you have earned the lunch.", categories: ["out", "cheap", "active"], minutes: 210, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "picnic-properly", title: "A picnic, done properly", blurb: "A rug, real glasses, the good cheese. Phones stay in the basket.", categories: ["out", "cheap", "active"], minutes: 150, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time", "closeness"] },
  { id: "bookshop-gift", title: "A bookshop, one book each for the other", blurb: "Twenty minutes apart, then swap. Inscribe it. Say why.", categories: ["out", "cheap"], minutes: 60, cost: "low", timeOfDay: "day", ways: ["gifts", "words"] },
  { id: "free-gallery", title: "The gallery that costs nothing", blurb: "Most of the good ones are free. Pick one room and stay in it.", categories: ["out", "cheap", "new"], minutes: 120, cost: "free", timeOfDay: "day", ways: ["time"] },
  { id: "walk-after-dinner", title: "A walk after dinner, every night this week", blurb: "Twenty minutes around the block. It is the seven of them that count.", categories: ["out", "cheap", "active"], minutes: 45, cost: "free", outdoors: true, timeOfDay: "evening", ways: ["time", "closeness"] },
  { id: "dessert-only", title: "Skip dinner, go for dessert", blurb: "Eat at home, then out for the good dessert place with all the time in the world.", categories: ["out", "cheap"], minutes: 60, cost: "low", timeOfDay: "evening", ways: ["time"] },
  { id: "lookout-thermos", title: "The lookout, with a thermos", blurb: "The one you drive past. Go up at night. Bring something hot.", categories: ["out", "cheap", "active"], minutes: 90, cost: "free", outdoors: true, timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "farmers-breakfast", title: "Breakfast at the farmers market", blurb: "Eat it standing up. Bring home whatever looked good.", categories: ["out", "cheap"], minutes: 120, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "photo-walk", title: "Ten photos each, then compare", blurb: "Same walk, same hour. See what the other one noticed.", categories: ["out", "cheap", "active", "new"], minutes: 120, cost: "free", outdoors: true, timeOfDay: "day", ways: ["time", "words"] },
  { id: "winter-beach", title: "The beach in winter", blurb: "Coats, a takeaway coffee, nobody else there. It is better than summer.", categories: ["out", "cheap", "active"], minutes: 120, cost: "low", outdoors: true, timeOfDay: "day", ways: ["closeness", "time"] },
  { id: "open-mic", title: "An open mic night", blurb: "Somebody's first time on stage. Clap loudest for the worst one.", categories: ["out", "cheap", "new"], minutes: 150, cost: "low", timeOfDay: "evening", ways: ["time"] },
  { id: "tourist-own-town", title: "Be tourists in your own town", blurb: "The things you would take a visitor to. Take yourselves.", categories: ["out", "cheap", "active", "new"], minutes: 240, cost: "low", timeOfDay: "day", ways: ["time"] },
  { id: "bowls-at-the-local", title: "Bowls or darts at the local", blurb: "Barefoot bowls if there is a club near you. Neither of you is good. That is the point.", categories: ["out", "cheap"], minutes: 120, cost: "low", timeOfDay: "evening", ways: ["time"] },
  { id: "hardware-then-build", title: "Hardware store, then build the thing", blurb: "The shelf, the planter box. Buy the bits together, build it together.", categories: ["out", "cheap"], minutes: 180, cost: "low", timeOfDay: "day", ways: ["acts"] },
  { id: "cheap-eats", title: "Best meal under $15, each", blurb: "Separate corners of the same street. Meet back with plates. Judge.", categories: ["out", "cheap"], minutes: 120, cost: "low", timeOfDay: "evening", ways: ["time"] },
  { id: "stargazing", title: "Drive out of the lights", blurb: "Forty minutes from town, a blanket on the bonnet. Find one thing you can name.", categories: ["out", "cheap", "active"], minutes: 180, cost: "free", outdoors: true, timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "bakery-crawl", title: "Three bakeries, one morning", blurb: "One thing from each. Rank them on the way home.", categories: ["out", "cheap", "active"], minutes: 150, cost: "low", timeOfDay: "day", ways: ["time"] },
  { id: "park-frisbee", title: "The park, with a frisbee", blurb: "Or a ball, or a kite. Something that makes you run.", categories: ["out", "cheap", "active"], minutes: 90, cost: "free", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "sunrise-swim", title: "The sunrise swim", blurb: "In before the sun is up, out as it clears the water. Coffee after, shivering.", categories: ["out", "cheap", "active", "new"], minutes: 90, cost: "low", outdoors: true, timeOfDay: "day", ways: ["closeness", "time"] },
  { id: "record-shop", title: "A second-hand record shop", blurb: "Buy them one they mentioned once. Play it tonight.", categories: ["out", "cheap"], minutes: 90, cost: "low", timeOfDay: "day", ways: ["gifts", "time"] },
  { id: "botanic-slow", title: "The botanic gardens, slowly", blurb: "No route, no time limit. Sit down more than you walk.", categories: ["out", "cheap", "active"], minutes: 120, cost: "free", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "sit-at-the-bar", title: "Sit at the bar, not a table", blurb: "One drink each, side by side. It is a different conversation from across a table.", categories: ["out", "cheap"], minutes: 120, cost: "low", timeOfDay: "evening", ways: ["time", "words"] },
  { id: "dog-park", title: "The dog park", blurb: "Borrow a dog if you have to. Nobody has a bad time at the dog park.", categories: ["out", "cheap", "active"], minutes: 60, cost: "free", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "volunteer-morning", title: "Volunteer somewhere for a morning", blurb: "A community garden, a food bank, a beach clean-up. See them be good at something.", categories: ["out", "cheap", "new"], minutes: 240, cost: "free", timeOfDay: "day", ways: ["acts", "time"] },
  { id: "rooftop-one-drink", title: "One drink somewhere with a view", blurb: "The expensive place, one round, then leave. You are there for the view.", categories: ["out", "cheap"], minutes: 90, cost: "low", timeOfDay: "evening", ways: ["time"] },
  { id: "pick-your-own", title: "A pick-your-own farm", blurb: "Strawberries, cherries, whatever is on. Eat more than you pick.", categories: ["out", "cheap", "active"], minutes: 240, cost: "low", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "ice-cream-long-way", title: "Ice cream, the long way home", blurb: "Walk to get it. Walk back a different way. Take an hour over ten minutes of ice cream.", categories: ["out", "cheap"], minutes: 60, cost: "low", timeOfDay: "evening", ways: ["time", "closeness"] },
  { id: "pub-trivia", title: "Trivia night at the pub", blurb: "Team of two. Discover what they know about 1980s cricket.", categories: ["out", "cheap"], minutes: 150, cost: "low", timeOfDay: "evening", ways: ["time", "words"] },
  { id: "arcade", title: "The arcade, like you are fifteen", blurb: "Twenty dollars in coins. Air hockey settles everything.", categories: ["out", "cheap"], minutes: 120, cost: "low", timeOfDay: "evening", ways: ["time"] },
  { id: "mini-golf", title: "Mini golf", blurb: "Keep score. Be a bad loser about it.", categories: ["out", "cheap"], minutes: 90, cost: "low", timeOfDay: "day", ways: ["time"] },
  { id: "rock-pools", title: "Rock pools at low tide", blurb: "Check the tide chart. Bring shoes you can get wet. Find a crab.", categories: ["out", "cheap", "active"], minutes: 120, cost: "free", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "recreate-first-date", title: "Do your first date again", blurb: "Same place if it still exists. Same order. Notice what has changed.", categories: ["out"], minutes: 180, cost: "mid", timeOfDay: "evening", ways: ["words", "gifts"] },
  { id: "karaoke-two", title: "Karaoke, just the two of you", blurb: "A private room. Nobody else gets to hear it. Duets are compulsory.", categories: ["out"], minutes: 120, cost: "mid", timeOfDay: "evening", ways: ["time", "words"] },

  // ----------------------------------------------------- going out, bigger
  { id: "proper-dinner", title: "The restaurant you keep saying you'll try", blurb: "Book it this time. The one you talk about and never do.", categories: ["out", "big"], minutes: 150, cost: "high", timeOfDay: "evening", ways: ["time", "gifts"] },
  { id: "live-music", title: "Live music, anyone at all", blurb: "Not a band you know. Whoever is playing somewhere small on Friday.", categories: ["out", "big", "new"], minutes: 180, cost: "mid", timeOfDay: "evening", ways: ["time"] },
  { id: "gallery-then-argue", title: "A gallery, then argue about it over dinner", blurb: "Each pick a favourite before you leave and defend it.", categories: ["out", "big", "new"], minutes: 210, cost: "mid", timeOfDay: "day", ways: ["words", "time"] },
  { id: "day-trip", title: "A whole day somewhere else", blurb: "Leave early, come back late. Somewhere that needs a drive.", categories: ["out", "big", "active", "new"], minutes: 480, cost: "mid", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "class-together", title: "Book a class in something neither of you does", blurb: "Pottery, boxing, pasta, sailing. Being bad at it together is the point.", categories: ["out", "big", "new"], minutes: 150, cost: "mid", ways: ["time"] },
  { id: "night-away", title: "One night away, anywhere", blurb: "It does not have to be far. It has to be not your house.", categories: ["out", "big"], minutes: 1440, cost: "high", ways: ["closeness", "time"] },
  { id: "drive-no-destination", title: "Drive an hour in one direction", blurb: "Pick a direction, drive an hour, find somewhere to eat there.", categories: ["out", "active", "new"], minutes: 240, cost: "mid", timeOfDay: "day", ways: ["time"] },
  { id: "degustation", title: "The degustation", blurb: "Nine courses, three hours, no decisions. Once a year, and it earns it.", categories: ["out", "big"], minutes: 210, cost: "high", timeOfDay: "evening", ways: ["gifts", "time"] },
  { id: "comedy-night", title: "A comedy night", blurb: "Somebody you have not heard of. Sit near the front and take the risk.", categories: ["out", "big"], minutes: 150, cost: "mid", timeOfDay: "evening", ways: ["time"] },
  { id: "theatre-they-mentioned", title: "The show they mentioned once", blurb: "They said it in passing. Book it, tell them the day before.", categories: ["out", "big"], minutes: 180, cost: "high", timeOfDay: "evening", ways: ["gifts", "acts"] },
  { id: "day-at-the-footy", title: "A day at the footy, or the races", blurb: "Whichever one of you does not usually go, goes. And gets into it.", categories: ["out", "big", "active"], minutes: 300, cost: "mid", timeOfDay: "day", ways: ["time", "acts"] },
  { id: "winery-lunch", title: "A winery lunch", blurb: "Somebody else drives, or you stay. Long tables, a bottle you would not buy at home.", categories: ["out", "big"], minutes: 300, cost: "high", timeOfDay: "day", ways: ["time"] },
  { id: "day-spa-both", title: "Hot springs, or a day spa, both of you", blurb: "Not a gift voucher for them. Both of you, all day, nothing to do.", categories: ["out", "big"], minutes: 240, cost: "high", timeOfDay: "day", ways: ["closeness", "gifts"] },
  { id: "band-from-when", title: "A band from the year you met", blurb: "Whoever is still touring. Sing every word, badly.", categories: ["out", "big"], minutes: 240, cost: "high", timeOfDay: "evening", ways: ["gifts", "words"] },
  { id: "weekend-camping", title: "A weekend in a tent", blurb: "Two nights, no reception. Come back smelling of smoke.", categories: ["out", "big", "active"], minutes: 2880, cost: "mid", outdoors: true, ways: ["closeness", "time"] },
  { id: "ferry-somewhere", title: "Take the ferry somewhere", blurb: "Any ferry. Lunch at the other end. The boat is most of the date.", categories: ["out", "big", "active"], minutes: 300, cost: "mid", timeOfDay: "day", ways: ["time"] },
  { id: "cooking-class", title: "A cooking class, then cook it again next week", blurb: "Learn it from someone who knows. The second time, at home, is the real date.", categories: ["out", "big", "new"], minutes: 180, cost: "mid", ways: ["time", "acts"] },
  { id: "kayaks", title: "Hire kayaks, or a little boat", blurb: "An afternoon on the water. One of you will fall in. Bring a towel.", categories: ["out", "big", "active", "new"], minutes: 180, cost: "mid", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "long-lunch", title: "The long lunch", blurb: "Both take a Friday off. Book the place. Do not book anything after it.", categories: ["out", "big"], minutes: 240, cost: "high", timeOfDay: "day", ways: ["time"] },
  { id: "hotel-own-city", title: "A hotel in your own city", blurb: "Fifteen minutes from home and a different world. Room service, late checkout.", categories: ["out", "big"], minutes: 1440, cost: "high", ways: ["closeness", "gifts"] },
  { id: "escape-room", title: "An escape room", blurb: "An hour of finding out how you argue under pressure. Useful, and fun.", categories: ["out", "big", "new"], minutes: 120, cost: "mid", ways: ["time"] },
  { id: "harbour-at-night", title: "The harbour, or the river, at night", blurb: "A dinner cruise, or just the last ferry with a bottle. The city from the water.", categories: ["out", "big"], minutes: 180, cost: "high", timeOfDay: "evening", ways: ["closeness", "gifts"] },
  { id: "tuesday-breakfast", title: "A proper breakfast out, on a Tuesday", blurb: "Dressed up, before work, somewhere with tablecloths. It is the Tuesday that makes it.", categories: ["out"], minutes: 90, cost: "mid", timeOfDay: "day", ways: ["gifts", "acts"] },
  { id: "drive-in", title: "The drive-in", blurb: "Blankets in the back, snacks from home. Whatever is showing.", categories: ["out", "big"], minutes: 180, cost: "mid", timeOfDay: "evening", ways: ["closeness"] },
  { id: "wildlife-tour", title: "Whales, or whatever is out there", blurb: "A boat, a tour, a morning looking at something bigger than you.", categories: ["out", "big", "active", "new"], minutes: 240, cost: "high", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "learn-to-dance", title: "Learn to dance, six lessons", blurb: "One night a week for six weeks. Book the first one; the rest follow.", categories: ["out", "big", "new"], minutes: 90, cost: "mid", timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "full-tank-no-plan", title: "A full tank and no plan", blurb: "Leave at eight. Turn where it looks interesting. Home when it is dark.", categories: ["out", "big", "active"], minutes: 480, cost: "mid", timeOfDay: "day", ways: ["time"] },
  { id: "train-for-lunch", title: "The train somewhere for lunch", blurb: "Two hours out, two hours back, and a window seat. Nobody drives.", categories: ["out", "big"], minutes: 300, cost: "mid", timeOfDay: "day", ways: ["time"] },
  { id: "high-tea", title: "High tea", blurb: "Tiny sandwiches and a tower of cake. Dress for it.", categories: ["out", "big"], minutes: 120, cost: "mid", timeOfDay: "day", ways: ["gifts"] },
  { id: "coast-dinner", title: "Dinner where you can see the water", blurb: "Book the table by the window. Time it for the sunset.", categories: ["out", "big"], minutes: 180, cost: "high", timeOfDay: "evening", ways: ["closeness", "time"] },
  { id: "tickets-never-buy", title: "Tickets to the thing they would never buy themselves", blurb: "The band, the show, the match. The one they think is too much.", categories: ["out", "big"], minutes: 180, cost: "high", timeOfDay: "evening", ways: ["gifts"] },
  { id: "brewery-tour", title: "A brewery or distillery tour", blurb: "Learn how it is made, taste it, bring one home for later.", categories: ["out", "big", "new"], minutes: 180, cost: "mid", timeOfDay: "day", ways: ["time"] },
  { id: "bike-hire-river", title: "Hire bikes along the river", blurb: "The flat, easy kind of ride. Stop everywhere that looks good.", categories: ["out", "big", "active"], minutes: 180, cost: "mid", outdoors: true, timeOfDay: "day", ways: ["time"] },
  { id: "small-bucket-list", title: "The small thing on their list", blurb: "Not the trip to Iceland. The thing they could do any weekend and have not.", categories: ["out", "big"], minutes: 240, cost: null, ways: ["gifts", "acts"] },
  { id: "progressive-dinner", title: "Three venues, one course each", blurb: "Entree at one place, main at the next, dessert at a third. Walk between them.", categories: ["out", "big"], minutes: 240, cost: "high", timeOfDay: "evening", ways: ["time"] },
  { id: "sunday-session", title: "A Sunday session that starts at two", blurb: "A beer garden, live music if there is any, and no plans for Monday morning.", categories: ["out", "big"], minutes: 300, cost: "mid", timeOfDay: "day", ways: ["time"] },
];

export type IdeaFilter = {
  categories?: IdeaCategory[];
  /** Longest the window is. An idea that does not fit is not an idea. */
  maxMinutes?: number;
  /** Whether the window is in the evening, so daytime ideas are held back. */
  evening?: boolean;
};

export function filterIdeas(ideas: DateIdea[], filter: IdeaFilter): DateIdea[] {
  return ideas.filter((idea) => {
    if (filter.categories?.length) {
      if (!filter.categories.some((c) => idea.categories.includes(c))) return false;
    }

    // An eight-hour day trip offered for a ninety-minute gap is the app not
    // reading its own screen.
    if (filter.maxMinutes !== undefined && idea.minutes > filter.maxMinutes) return false;

    if (filter.evening !== undefined && idea.timeOfDay) {
      const wantsEvening = idea.timeOfDay === "evening";
      if (wantsEvening !== filter.evening) return false;
    }

    return true;
  });
}

/**
 * One idea, chosen so that the same person does not see the same one twice in
 * a row.
 *
 * Seeded rather than random so that a re-render does not reshuffle the card
 * under somebody's thumb, which is the sort of thing that makes an app feel
 * untrustworthy.
 */
export function pickIdea(ideas: DateIdea[], seed: number): DateIdea | null {
  if (ideas.length === 0) return null;
  return ideas[Math.abs(Math.floor(seed)) % ideas.length];
}

/** A stable seed that changes once a day. */
export function daySeed(at: Date = new Date()): number {
  return Math.floor(at.getTime() / (24 * 60 * 60 * 1000));
}

/** The most options worth offering. Past three it is a survey, not an invitation. */
export const MAX_OPTIONS = 3;

/**
 * The windows to offer.
 *
 * Spread across different days rather than the first three going, because
 * three options on the same evening is one option. Falls back to whatever
 * there is when the diary is too full to spread.
 */
export function spreadOptions(windows: Interval[], count = MAX_OPTIONS): Interval[] {
  // Sorted going in, so "the first window on each day" means the earliest one
  // and not whichever the caller happened to list first. Free windows arrive
  // in order today; relying on that is how this quietly breaks the day
  // somebody calls it with something else.
  const inOrder = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());

  const byDay = new Map<string, Interval>();
  for (const w of inOrder) {
    const key = w.start.toDateString();
    if (!byDay.has(key)) byDay.set(key, w);
    if (byDay.size >= count) break;
  }

  const chosen = new Set(byDay.values());

  // Not enough distinct days. Top up from the same ones rather than offer
  // fewer, because two options are still a choice.
  for (const w of inOrder) {
    if (chosen.size >= count) break;
    chosen.add(w);
  }

  return [...chosen]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, count);
}

/**
 * How long an idea takes, in words.
 *
 * `Math.round(minutes / 60)` gave "About 1 hours" on the three sixty-minute
 * ideas, called ninety minutes two hours, and described a night away -- 1440
 * minutes -- as "most of a day".
 */
export function lengthLabel(minutes: number): string {
  if (minutes >= 2400) return "A weekend";
  if (minutes >= 1440) return "Overnight";
  if (minutes >= 480) return "Most of a day";
  if (minutes >= 75 && minutes < 105) return "About an hour and a half";
  if (minutes < 75) return "About an hour";

  const hours = Math.round(minutes / 60);
  return `About ${hours} hours`;
}
