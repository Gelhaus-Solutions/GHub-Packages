// @vitest-environment jsdom

/**
 * The draft keeper, in a document with a real `sessionStorage`.
 *
 * The sheet's contract: unsaved text is kept in session storage under the
 * draft and its revision as it is typed; following a link never asks and never
 * loses it; coming back offers it in an info Banner with Save and Discard;
 * closing the tab with unsaved text gets the browser's own prompt; and if the
 * draft was saved elsewhere meanwhile, the banner can say which revision the
 * copy is based on. Plus the package's own rule: storage that throws (a
 * private window) costs the copy, never the page.
 *
 * VERIFIED BY MUTATION: writing over a copy that is on offer, and writing a
 * just-saved text back before the page's saved copy catches up, each turn
 * this file red.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftKeeperBanner, useDraftKeeper } from "./modern/draft-keeper.js";

const KEY = "terms-draft:gcontrol-privacy-2026-10-03";

type Fields = { title: string; body: string };

const SAVED: Fields = { title: "GControl privacy notice", body: "We use one sub-processor." };

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

/**
 * A draft page: a field, a save, and the banner when a copy comes back.
 *
 * Saving is two steps, as it is against a server: the save answers with the
 * next revision at once, and the page's saved text catches up on the refresh
 * after it ("Refresh"). `lagging` keeps those apart, which is the window in
 * which a cleared copy could be written straight back.
 */
function Draft({ onSaved, lagging = false }: { onSaved?: () => void; lagging?: boolean }) {
  const [revision, setRevision] = useState(6);
  const [saved, setSaved] = useState<Fields>(SAVED);
  const [values, setValues] = useState<Fields>(SAVED);
  const keeper = useDraftKeeper({ key: KEY, revision, values, saved });

  return createElement("div", null, [
    keeper.restored === null
      ? null
      : createElement(DraftKeeperBanner, {
          key: "banner",
          title: `Your unsaved changes from revision ${String(keeper.restored.revision)} are back`,
          body: "You followed a link before saving; they were kept in this browser.",
          save: {
            label: "Keep them",
            onSave: () => {
              if (keeper.restored !== null) setValues(keeper.restored.values);
              keeper.accept();
            },
          },
          discard: { label: "Discard them", onDiscard: keeper.discard },
        }),
    createElement("input", {
      key: "title",
      "aria-label": "Title",
      value: values.title,
      onChange: (event: { target: { value: string } }) => {
        setValues({ ...values, title: event.target.value });
      },
    }),
    createElement("p", { key: "dirty", "data-testid": "dirty" }, keeper.dirty ? "dirty" : "clean"),
    createElement(
      "button",
      {
        key: "save",
        type: "button",
        onClick: () => {
          keeper.saved();
          onSaved?.();
          setRevision((current) => current + 1);
          if (!lagging) setSaved(values);
        },
      },
      "Save the draft",
    ),
    createElement(
      "button",
      {
        key: "refresh",
        type: "button",
        onClick: () => {
          setSaved(values);
        },
      },
      "Refresh",
    ),
  ]);
}

function kept(): { revision: number; at: string; values: Fields } | null {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null
    ? null
    : (JSON.parse(raw) as { revision: number; at: string; values: Fields });
}

function title(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name: "Title" });
}

describe("keeping", () => {
  it("keeps nothing while the fields say what is saved", () => {
    render(createElement(Draft, {}));
    expect(kept()).toBeNull();
    expect(screen.getByTestId("dirty").textContent).toBe("clean");
  });

  it("keeps every change that differs from what is saved, with its revision and time", async () => {
    const user = userEvent.setup();
    render(createElement(Draft, {}));
    await user.type(title(), ", draft");

    const copy = kept();
    expect(copy?.values).toEqual({ ...SAVED, title: "GControl privacy notice, draft" });
    expect(copy?.revision).toBe(6);
    expect(Number.isNaN(new Date(copy?.at ?? "").getTime())).toBe(false);
    expect(screen.getByTestId("dirty").textContent).toBe("dirty");
  });

  it("drops the copy when the text is put back the way it was saved", async () => {
    const user = userEvent.setup();
    render(createElement(Draft, {}));
    await user.type(title(), "x");
    expect(kept()).not.toBeNull();
    await user.type(title(), "{Backspace}");
    expect(kept()).toBeNull();
  });

  it("clears the copy on a save and does not write it back before the page catches up", async () => {
    const user = userEvent.setup();
    let atSave: unknown = "unset";
    render(
      createElement(Draft, {
        onSaved: () => {
          atSave = window.sessionStorage.getItem(KEY);
        },
      }),
    );
    await user.type(title(), "!");
    await user.click(screen.getByRole("button", { name: "Save the draft" }));
    expect(atSave).toBeNull();
    expect(kept()).toBeNull();
    expect(screen.getByTestId("dirty").textContent).toBe("clean");

    await user.type(title(), "?");
    expect(kept()?.values.title).toBe("GControl privacy notice!?");
    expect(kept()?.revision).toBe(7);
  });

  it("does not write the saved text back while the page's saved copy is still the old one", async () => {
    const user = userEvent.setup();
    render(createElement(Draft, { lagging: true }));
    await user.type(title(), "!");
    // The revision moves at once; the saved text has not caught up yet.
    await user.click(screen.getByRole("button", { name: "Save the draft" }));
    expect(kept()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(kept()).toBeNull();
    expect(screen.getByTestId("dirty").textContent).toBe("clean");
  });
});

describe("offering back", () => {
  function plant(values: Fields, revision = 5) {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ revision, at: "2026-10-03T07:40:00.000Z", values }),
    );
  }

  it("offers a kept copy that differs, in an info banner with both verbs, and leaves it alone meanwhile", () => {
    plant({ ...SAVED, body: "We use two sub-processors." });
    render(createElement(Draft, {}));

    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Your unsaved changes from revision 5 are back");
    expect(banner.className).toContain("bg-m-info-wash");
    expect(screen.getByRole("button", { name: "Keep them" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard them" })).toBeTruthy();
    // On offer, so nothing wrote over it in the pass that found it.
    expect(kept()?.values.body).toBe("We use two sub-processors.");
    expect(kept()?.revision).toBe(5);
  });

  it("hands back the values, the revision they were based on and when they were typed", () => {
    plant({ ...SAVED, title: "Kept title" }, 4);
    let seen: { values: Fields; at: Date; revision: number } | null = null;
    function Peek() {
      const keeper = useDraftKeeper({ key: KEY, revision: 6, values: SAVED, saved: SAVED });
      seen = keeper.restored;
      return null;
    }
    render(createElement(Peek));
    expect(seen).toEqual({
      values: { ...SAVED, title: "Kept title" },
      at: new Date("2026-10-03T07:40:00.000Z"),
      revision: 4,
    });
  });

  it("puts the copy into the fields on accept and keeps it as the working copy", async () => {
    const user = userEvent.setup();
    plant({ ...SAVED, title: "Kept title" });
    render(createElement(Draft, {}));
    await user.click(screen.getByRole("button", { name: "Keep them" }));

    expect(screen.queryByRole("status")).toBeNull();
    expect(title().value).toBe("Kept title");
    expect(screen.getByTestId("dirty").textContent).toBe("dirty");
    expect(kept()?.values.title).toBe("Kept title");
    expect(kept()?.revision).toBe(6);
  });

  it("drops the copy on discard", async () => {
    const user = userEvent.setup();
    plant({ ...SAVED, title: "Kept title" });
    render(createElement(Draft, {}));
    await user.click(screen.getByRole("button", { name: "Discard them" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(title().value).toBe(SAVED.title);
    expect(kept()).toBeNull();
  });

  it("drops a copy that says what is saved anyway, without offering it", () => {
    plant(SAVED);
    render(createElement(Draft, {}));
    expect(screen.queryByRole("status")).toBeNull();
    expect(kept()).toBeNull();
  });

  it("ignores a copy that is not one", () => {
    window.sessionStorage.setItem(KEY, "{not json");
    render(createElement(Draft, {}));
    expect(screen.queryByRole("status")).toBeNull();
    window.sessionStorage.setItem(KEY, JSON.stringify({ revision: "6", at: "x", values: {} }));
    cleanup();
    render(createElement(Draft, {}));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("closing the tab", () => {
  function unload(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("asks while there is unsaved text, and not otherwise", async () => {
    const user = userEvent.setup();
    render(createElement(Draft, {}));
    expect(unload()).toBe(false);
    await user.type(title(), "x");
    expect(unload()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save the draft" }));
    expect(unload()).toBe(false);
  });

  it("asks while a kept copy is on offer, because closing the tab would lose it", () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        revision: 6,
        at: "2026-10-03T07:40:00.000Z",
        values: { ...SAVED, title: "Kept" },
      }),
    );
    render(createElement(Draft, {}));
    expect(unload()).toBe(true);
  });
});

describe("storage that refuses", () => {
  it("costs the copy, never the page", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    const user = userEvent.setup();
    render(createElement(Draft, {}));
    await user.type(title(), " still works");
    expect(title().value).toBe("GControl privacy notice still works");
    expect(screen.getByTestId("dirty").textContent).toBe("dirty");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Save the draft" }));
    });
    expect(screen.getByTestId("dirty").textContent).toBe("clean");
  });
});
