/**
 * The three auroras behind every Aurora screen (Legal Phase 1, "Theme"): the
 * accent high on the left, info at the right, a fainter accent further down.
 * Fixed to the window rather than to the page, so content scrolls over the
 * light. They drift 50 to 60px over 16 to 24 seconds, and not at all for
 * somebody who asked for less motion. Decoration only: `aria-hidden`, no
 * pointer events, under everything in the nearest isolated parent.
 *
 * The upstream copy (W5) of the one Legal, Identity, Integrate and Billing each
 * hold, drawn the same to the class, so moving an app onto it changes nothing
 * on its screens. Its light comes from `aurora.css`: without that import the
 * three layers are there and paint nothing.
 */
export function Auroras() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute top-[-200px] left-[2%] h-[520px] w-[820px] animate-a-drift-1 rounded-full bg-(image:--ga-aurora-accent) [--a-drift-x:56px]" />
      <div className="absolute top-[-120px] right-[-140px] h-[440px] w-[600px] animate-a-drift-2 rounded-full bg-(image:--ga-aurora-info) [--a-drift-x:-50px]" />
      <div className="absolute top-[760px] left-[30%] h-[560px] w-[760px] animate-a-drift-3 rounded-full bg-(image:--ga-aurora-low) [--a-drift-x:60px]" />
    </div>
  );
}
