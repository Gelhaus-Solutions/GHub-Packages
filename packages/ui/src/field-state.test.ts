import { describe, expect, it } from "vitest";
import {
  FIELD_BORDER_TONES,
  FIELD_MESSAGE_TONES,
  fieldBorderTone,
  fieldDescribedBy,
  fieldMessageId,
  isRefused,
} from "./field-state.js";

describe("which border a field wears", () => {
  it("gives a field with neither an error nor a status no border of its own", () => {
    expect(fieldBorderTone(false, undefined)).toBeUndefined();
  });

  it("colours a field by its status when nothing has been refused", () => {
    expect(fieldBorderTone(false, "warn")).toBe(FIELD_BORDER_TONES.warn);
    expect(fieldBorderTone(false, "info")).toBe(FIELD_BORDER_TONES.info);
    expect(fieldBorderTone(false, "ok")).toBe(FIELD_BORDER_TONES.ok);
  });

  /**
   * The property, not the implementation.
   *
   * A field that has been told its value is wrong must not also look like it is
   * still being checked, and it must never wear two borders at once. Asserted
   * against every status rather than against one, because the failure this
   * guards is a class list that concatenates instead of choosing, and that one
   * only shows up for whichever status happens to be tried.
   */
  it("lets a refusal outrank every status, and never emits two borders", () => {
    for (const status of ["info", "warn", "ok"] as const) {
      const tone = fieldBorderTone(true, status);
      expect(tone).toBe(fieldBorderTone(true, undefined));
      expect(tone).not.toContain(FIELD_BORDER_TONES[status]);
      expect(tone?.match(/(?:^| )border-/g)).toHaveLength(1);
    }
  });
});

describe("the two ways a control says it was refused", () => {
  it("counts a message as a refusal, and no message as none", () => {
    expect(isRefused("that code did not work", undefined)).toBe(true);
    expect(isRefused(undefined, undefined)).toBe(false);
  });

  /**
   * The whole point of the flag. A control refused by something else on the
   * screen is still refused, and a person who cannot see the border has only
   * `aria-invalid` to tell them.
   */
  it("counts the flag on its own, so a refusal stated elsewhere still counts", () => {
    expect(isRefused(undefined, true)).toBe(true);
    expect(isRefused(undefined, false)).toBe(false);
  });

  /**
   * An empty string is a message somebody rendered, so it is a refusal. Only
   * `undefined` is the absence of one, which is what `error` being optional
   * means everywhere else in this file.
   */
  it("treats an empty message as a message rather than as silence", () => {
    expect(isRefused("", undefined)).toBe(true);
  });

  /**
   * The property that makes the two interchangeable to a control: whichever way
   * a refusal was stated, the border and the announcement are the same. A
   * version that gave `invalid` a softer border would be a refusal that looks
   * less refused depending on where its sentence happens to live.
   */
  it("gives both ways the same border", () => {
    const byMessage = fieldBorderTone(isRefused("wrong", undefined), undefined);
    const byFlag = fieldBorderTone(isRefused(undefined, true), undefined);
    expect(byFlag).toBe(byMessage);
    expect(byFlag).toBeDefined();
  });

  it("lets a refusal stated elsewhere outrank a status, exactly as a message does", () => {
    for (const status of ["info", "warn", "ok"] as const) {
      const tone = fieldBorderTone(isRefused(undefined, true), status);
      expect(tone).toBe(fieldBorderTone(true, undefined));
      expect(tone).not.toContain(FIELD_BORDER_TONES[status]);
      expect(tone?.match(/(?:^| )border-/g)).toHaveLength(1);
    }
  });
});

describe("what a control is described by", () => {
  it("describes a control by its message when the shell renders one", () => {
    expect(fieldDescribedBy("vat", true, undefined)).toBe("vat-message");
    expect(fieldMessageId("vat")).toBe("vat-message");
  });

  /**
   * The regression that made this file exist. A field with a hint or an error
   * under it and no `aria-describedby` renders a sentence that is announced to
   * nobody, and no automated check catches it.
   */
  it("points at the same id the shell puts on the message", () => {
    expect(fieldDescribedBy("vat", true, undefined)).toContain(fieldMessageId("vat") as string);
  });

  it("says nothing when there is no message and the caller gave none", () => {
    expect(fieldDescribedBy("vat", false, undefined)).toBeUndefined();
  });

  /**
   * A field can be described by something outside itself as well, so ours is
   * appended rather than substituted. Dropping the caller's is a silent removal
   * of a description, which is the same failure this whole helper exists to fix.
   */
  it("keeps a description the caller already gave, and adds ours after it", () => {
    expect(fieldDescribedBy("vat", true, "legend")).toBe("legend vat-message");
    expect(fieldDescribedBy("vat", false, "legend")).toBe("legend");
  });

  it("has no id to point at for a control with no id", () => {
    expect(fieldMessageId(undefined)).toBeUndefined();
  });
});

describe("the message tones", () => {
  /**
   * Every status carries ink rather than the status colour itself, for the
   * reason `Badge` states: this is text on the page's own ground and owes 4.5:1,
   * where the ramp colour owes the 3:1 of a graphic. `contrast.test.ts` proves
   * the inks clear that bar; this proves the message uses them.
   */
  it("colours a message with ink rather than with the ramp colour", () => {
    for (const tone of Object.values(FIELD_MESSAGE_TONES)) {
      expect(tone).toMatch(/^text-(?:info|warn|ok)-ink$/);
    }
  });
});
