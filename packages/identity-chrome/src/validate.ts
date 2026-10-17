/**
 * What is believed about an answer before it is drawn.
 *
 * A tile's address becomes a link on every page of every product that mounts the
 * controls, and an icon's address becomes an image source. Both come over the
 * network, from a service that is trusted and not infallible, so the shape is
 * checked and an address with any scheme but http or https is **dropped, not
 * repaired**: a `javascript:` link is script on the host's page, and a tile that
 * goes nowhere is a smaller fault than that.
 *
 * Applied to the cached copy as well as to a fresh answer, because the cache is
 * storage anybody on the device can write.
 */

import type {
  CatalogueEntry,
  ChromeLegal,
  ChromePublicView,
  ChromeTile,
  ChromeView,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An absolute http or https address, or null. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function tileOf(value: unknown): ChromeTile | null {
  if (!isRecord(value)) return null;
  const { slug, displayName, homeUrl, iconUrl, current } = value;
  if (
    typeof slug !== "string" ||
    slug === "" ||
    typeof displayName !== "string" ||
    displayName === ""
  ) {
    return null;
  }
  const href = safeUrl(homeUrl);
  if (href === null) return null;
  return {
    slug,
    displayName,
    homeUrl: href,
    iconUrl: iconUrl === null || iconUrl === undefined ? null : safeUrl(iconUrl),
    current: current === true,
  };
}

function tilesOf(value: unknown): ChromeTile[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(tileOf).filter((tile): tile is ChromeTile => tile !== null);
}

/**
 * Both footer links, or null. Missing is not a broken answer: an older Identity or
 * an older cached copy has none, and the popup draws no footer rather than nothing.
 */
function legalOf(value: unknown): ChromeLegal | null {
  if (!isRecord(value)) return null;
  const termsUrl = safeUrl(value["termsUrl"]);
  const privacyUrl = safeUrl(value["privacyUrl"]);
  return termsUrl === null || privacyUrl === null ? null : { termsUrl, privacyUrl };
}

/** A view that can be drawn, or null where the answer is not one. */
export function parseView(value: unknown): ChromeView | null {
  if (!isRecord(value) || !isRecord(value["person"])) return null;
  const person = value["person"];
  const yours = tilesOf(value["yours"]);
  const more = tilesOf(value["more"]);
  if (yours === null || more === null) return null;
  if (typeof person["hasIdentity"] !== "boolean") return null;
  const avatar = person["avatarUrl"];
  return {
    person: {
      hasIdentity: person["hasIdentity"],
      avatarUrl: avatar === null || avatar === undefined ? null : safeUrl(avatar),
    },
    yours,
    more,
    legal: legalOf(value["legal"]),
  };
}

export function parsePublicView(value: unknown): ChromePublicView | null {
  if (!isRecord(value)) return null;
  const more = tilesOf(value["more"]);
  return more === null ? null : { more, legal: legalOf(value["legal"]) };
}

/** A catalogue entry that can be drawn, or null where the answer is not one. */
export function parseCatalogueEntry(value: unknown): CatalogueEntry | null {
  if (!isRecord(value)) return null;
  const { slug, displayName, homeUrl, iconUrl, monoIconUrl, updatedAt } = value;
  if (
    typeof slug !== "string" ||
    slug === "" ||
    typeof displayName !== "string" ||
    displayName === ""
  ) {
    return null;
  }
  const home = safeUrl(homeUrl);
  if (home === null || typeof updatedAt !== "string") return null;
  return {
    slug,
    displayName,
    homeUrl: home,
    iconUrl: iconUrl === null || iconUrl === undefined ? null : safeUrl(iconUrl),
    monoIconUrl: monoIconUrl === null || monoIconUrl === undefined ? null : safeUrl(monoIconUrl),
    updatedAt,
  };
}
