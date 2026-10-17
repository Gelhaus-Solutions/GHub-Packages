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
  /**
   * Which of the seven avatar tints the Identity's id picks (0 to 6, `avatarTint`),
   * so the coloured initial is the same in every product. Null without an Identity,
   * and from an Identity too old to send it.
   */
  tint: number | null;
}

/**
 * Where the account popup's own links go on Identity: the pill and the pencil.
 * Identity sends them, like the footer, so its address can move without a
 * release here. Null when they were not sent or any is not a web address, and
 * then neither the pill nor the pencil is drawn.
 */
export interface ChromeIdentityLinks {
  /** "Manage your Identity account". */
  accountUrl: string;
  /** The pencil on the picture: the profile screen, where the picture is set. */
  pictureUrl: string;
  /** "Set up your Identity": registration, saying which product sent them and never carrying an address. */
  setupUrl: string;
  /** Identity's own mark for the pill, at an address that always leads to the current file. */
  iconUrl: string | null;
}

/**
 * The account popup's two footer links, the same in every product. Identity sends
 * them, so a moved address needs no new release of this package. Null when they
 * were not sent or either is not a web address, and then the footer is not drawn.
 */
export interface ChromeLegal {
  termsUrl: string;
  privacyUrl: string;
}

/** The person, the products they have, the public ones they do not, Identity's own links and the footer. */
export interface ChromeView {
  person: ChromePerson;
  yours: ChromeTile[];
  more: ChromeTile[];
  identity: ChromeIdentityLinks | null;
  legal: ChromeLegal | null;
}

/** The public half alone, for painting the lower group before the personal one arrives. */
export interface ChromePublicView {
  more: ChromeTile[];
  legal: ChromeLegal | null;
}

/**
 * A product's name and marks as Identity keeps them: the one place they live, so
 * a product reads its own here for its top bar, title and favicon, and a rename or
 * a new mark reaches every product without a release.
 */
export interface CatalogueEntry {
  slug: string;
  displayName: string;
  homeUrl: string;
  /** The colour mark, at an address that never changes its file. Null until one is uploaded. */
  iconUrl: string | null;
  /** The one colour mark, the same way. */
  monoIconUrl: string | null;
  /** When the entry or a mark last changed, ISO. */
  updatedAt: string;
}
