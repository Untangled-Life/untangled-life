/**
 * Every screen in the tab group is either a tab or deliberately not one.
 *
 * Expo Router builds the tab bar from the DIRECTORY, so a new file under
 * app/(tabs) becomes a fifth tab the moment it exists unless the layout says
 * otherwise. That is how "Personalisation" turned up in the tab bar next to
 * Home and Wishlists: nothing was wrong with the screen, and nothing in the
 * code said it should be there.
 *
 * A comment in the layout did not prevent it and would not prevent it again.
 *
 * The node built-ins are declared locally rather than by adding @types/node.
 * Pulling node's globals into a React Native project redefines setTimeout and
 * friends, and buying a type error everywhere to fix one here is a bad trade.
 */
declare const __dirname: string;
declare function require(id: string): unknown;

type Dirent = { name: string; isDirectory(): boolean };
type Fs = {
  readdirSync(p: string, o: { withFileTypes: true }): Dirent[];
  readFileSync(p: string, e: "utf8"): string;
};
type Path = { join(...parts: string[]): string };

const fs = require("fs") as Fs;
const path = require("path") as Path;

const TABS_DIR = path.join(__dirname, "..", "app", "(tabs)");

function screenNames(): string[] {
  return fs
    .readdirSync(TABS_DIR, { withFileTypes: true })
    .filter((e) => e.name !== "_layout.tsx")
    .filter((e) => e.isDirectory() || e.name.endsWith(".tsx"))
    .map((e) => e.name.replace(/\.tsx$/, ""));
}

describe("the tab bar", () => {
  const layout = fs.readFileSync(path.join(TABS_DIR, "_layout.tsx"), "utf8");

  it("accounts for every screen in the group", () => {
    const missing = screenNames().filter((name) => !layout.includes(`name="${name}"`));
    expect(missing).toEqual([]);
  });

  // The four the product actually has. A fifth appearing is either a decision
  // somebody made on purpose, in which case this line changes, or a file that
  // wandered into the tab bar, in which case it did not.
  it("shows exactly the four intended tabs", () => {
    const visible = screenNames().filter((name) => {
      const declaration = layout.match(
        new RegExp(`<Tabs\\.Screen\\s+name="${name}"[\\s\\S]*?/>`)
      );
      return declaration ? !declaration[0].includes("href: null") : false;
    });

    expect(visible.sort()).toEqual(["index", "key-dates", "todos", "wishlists"]);
  });

  // The edge swipe steps back one screen, except on a tab, where there is
  // nothing behind it and it goes Home instead. It knows which is which from
  // a list of routes, and a list of routes is a copy of something -- so a
  // fifth tab added one day would quietly get the wrong gesture.
  it("keeps the edge swipe's list of tab routes honest", () => {
    const declared = layout.match(/const TAB_ROUTES = \[([^\]]*)\]/);
    expect(declared).not.toBeNull();

    const routes = (declared as RegExpMatchArray)[1]
      .split(",")
      .map((entry) => entry.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);

    const visible = screenNames().filter((name) => {
      const declaration = layout.match(
        new RegExp(`<Tabs\\.Screen\\s+name="${name}"[\\s\\S]*?/>`)
      );
      return declaration ? !declaration[0].includes("href: null") : false;
    });

    expect(routes.sort()).toEqual(
      visible.map((name) => (name === "index" ? "/" : `/${name}`)).sort()
    );
  });
});
