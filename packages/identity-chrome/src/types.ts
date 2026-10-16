/**
 * What the header controls are told. These are the shapes GPlatform Identity
 * answers with, kept in step by hand with `ChromeView` there: this package is
 * public and cannot depend on that one, so a change to either is a change to
 * both.
 */

/** One tile in the apps picker. */
export interface ChromeTile {
  slug: string;
  displayName: string;
  /** Where the tile goes. Only ever an http or https address: anything else is dropped on arrival. */
  homeUrl: string;
  /** Identity's address for the icon, or null until one is uploaded. */
  iconUrl: string | null;
  /** Whether this is the product the person is in. */
  current: boolean;
}

/** What the person's own Identity adds to the account popup. Never a name: the product shows its own. */
export interface ChromePerson {
  hasIdentity: boolean;
  avatarUrl: string | null;
}

/** The person, the products they have, and the public ones they do not. */
export interface ChromeView {
  person: ChromePerson;
  yours: ChromeTile[];
  more: ChromeTile[];
}

/** The public half alone, for painting the lower group before the personal one arrives. */
export interface ChromePublicView {
  more: ChromeTile[];
}
