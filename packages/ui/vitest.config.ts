import { defineConfig } from "vitest/config";

export default defineConfig({
  /**
   * JSX, so a test in this package can load a component at all.
   *
   * Until this line every test here was a pure logic `.ts` module, and that was
   * not a style: `tsconfig.json` extends the react config, which sets
   * `jsx: "preserve"` because a published package emits through
   * `tsconfig.build.json` with `react-jsx` instead. Vite reads the checking
   * config, gets `preserve`, and fails to parse the first `.tsx` it is asked
   * for with "content contains invalid JS syntax".
   *
   * So a design system of thirty-nine components had no test that could render
   * one, and nothing said so. The failure appears only when somebody tries,
   * which is why it survived: every existing suite here tests a behaviour
   * module that happens to carry no markup.
   *
   * `automatic` matches what the build emits, so what a test renders is what a
   * consumer receives rather than a second transform with its own opinions.
   *
   * It is `oxc` rather than `esbuild` because Vite 8 transforms with oxc, and
   * setting the esbuild option is not an error: it warns that "oxc options will
   * be used and esbuild options will be ignored" and then fails exactly as it
   * did before. A configuration key that is accepted, ignored and reported only
   * on stderr is the same shape as everything else found this week.
   */
  oxc: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.ts"],

    /**
     * `node` is the default and should stay the default.
     *
     * Most suites here are markup and logic: they render through
     * `renderToStaticMarkup` and compare strings, and a DOM would cost them
     * startup for nothing. A file that genuinely needs a document declares it
     * for itself with `// @vitest-environment jsdom` on its first line, which
     * is what `modern-interaction.test.ts` does.
     *
     * DO NOT FLIP THIS TO `jsdom` TO MAKE ONE NEW TEST WORK. Doing so would
     * move fourteen suites into an environment they were never written for,
     * and the ones that would break are not the ones you would expect: jsdom
     * supplies a `window` and the components under test are happy to find one,
     * so the failures would be silent differences in what gets rendered rather
     * than an error naming the cause.
     */
    environment: "node",

    /**
     * The timezone, pinned, because a frozen clock is not a fixed rendering.
     *
     * `console-characterisation.test.ts` freezes time and uses `new Date(0)` in
     * its props bag, and its docblock reasons that the epoch makes the snapshot
     * pin markup rather than the hour it was taken. That fixes the instant and
     * not its string: `Date.prototype.toString()` reads the host zone, so the
     * component that spreads an unrecognised `date` prop onto the DOM wrote
     * "GMT+0100 (Central European Standard Time)" into 20 snapshots. CI is UTC
     * and read "GMT+0000", so the suite was 208 passed on the machine that
     * recorded it and 20 failed everywhere else, including on origin.
     *
     * So the zone is part of the fixture and belongs beside the clock. Pinning
     * it here rather than in the one suite covers every date-bearing snapshot
     * this package grows later, which is the failure returning under a new name.
     *
     * The `Date` objects stay `Date` objects. Passing a fixed ISO string would
     * also settle the snapshot, but components that format or compare a date
     * call `getTime` and `toLocaleString` on it, so a string would change what
     * they render and the pin would then describe a fixture no caller uses.
     *
     * Verified by running the package under three zones rather than by reading
     * the option: CEST, UTC and Pacific/Kiritimati all report the same counts.
     */
    env: { TZ: "UTC" },
  },
});
