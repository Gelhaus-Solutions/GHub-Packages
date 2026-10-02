/**
 * `@ghub/gctl-terms` 0.1.4, as a format 1 snapshot.
 *
 * The tests of the rules that moved here were written against that package's
 * archive, so they are asked of the same archive here, converted rather than
 * retyped. Generated from the 0.1.4 release of `@ghub/gctl-terms`: `ARCHIVE`
 * from `src/manifest.ts`, `COVERS` and
 * `NOT_YET_ARCHIVED` from `src/consent.ts`, and the titles from the first line
 * of each archived `.md`, which is the title the publisher froze. Each field and
 * where it came from:
 *
 * - `documents`: every document 0.1.4 archived or linked, in the order the
 *   archive first names it, then the one it only linked (GPlatform Billing's
 *   terms). `product` is the middle part of the key. `kind` is `consent` for
 *   all of them, because 0.1.4 held no privacy notice. `liveUrl.en` is the
 *   manifest's `live_url`, or the `NOT_YET_ARCHIVED` link where nothing of the
 *   document was archived; the two agree wherever both exist. 0.1.4 named no
 *   German live page, so `liveUrl.de` is left out rather than guessed.
 * - `versions`: one per manifest entry, in manifest order. `archiveUrl.en` is
 *   the manifest's `archive_url`. `archiveUrl.de` has no source in 0.1.4,
 *   which held one archive URL per version; it follows the homepage's own rule
 *   that German is served under `/de/` with the path otherwise unchanged, so
 *   `https://gplatform.org/legal/<id>` becomes
 *   `https://gplatform.org/de/legal/<id>`. `frozenAt` is `effective_from`.
 * - `surfaces`: `COVERS` in order, each with the `NOT_YET_ARCHIVED` links for
 *   the documents it covers. 0.1.4 kept one list of links for every surface;
 *   the snapshot keeps them per surface, so each surface carries the ones it
 *   can reach and no others.
 * - `rollouts`: one default (`surface: null`) per version, from its
 *   `announced_at`, `in_force_from` and `summary`. 0.1.4 had no surface of its
 *   own for any date, so a default for every version is exactly what it meant.
 * - `generatedAt` is the 0.1.4 release commit's time, since 0.1.4 had no
 *   generation time of its own, and `serial` is 1.
 *
 * Instants. 0.1.4 wrote the publisher's freeze times without a zone, as
 * `2026-09-06 18:40:41`, and `instantOf` read every such value as UTC. A
 * snapshot refuses an instant without a zone, so each of those is written here
 * with `Z`, which is exactly the instant 0.1.4 meant by it; the line says so
 * and quotes the original. Values 0.1.4 already wrote with a zone are copied
 * unchanged.
 */

import type { Snapshot } from "../snapshot.js";

export const GCTL_TERMS_0_1_4: Snapshot = {
  format: 1,
  serial: 1,
  generatedAt: "2026-10-01T19:16:32+02:00",
  documents: [
    {
      key: "project:gcontrol:terms",
      product: "gcontrol",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gcontrol/terms" },
    },
    {
      key: "project:gadvisory:terms",
      product: "gadvisory",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gadvisory/terms" },
    },
    {
      key: "page:gs:terms",
      product: "gs",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/terms" },
    },
    {
      key: "project:gopencdr:terms",
      product: "gopencdr",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gopencdr/terms" },
    },
    {
      key: "project:gopencdr:acceptable-use",
      product: "gopencdr",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gopencdr/acceptable-use" },
    },
    {
      key: "project:gopencsr:terms",
      product: "gopencsr",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gopencsr/terms" },
    },
    {
      key: "project:gopencsr:acceptable-use",
      product: "gopencsr",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gopencsr/acceptable-use" },
    },
    {
      key: "project:gopencnr:terms",
      product: "gopencnr",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gopencnr/terms" },
    },
    {
      key: "project:gopencnr:acceptable-use",
      product: "gopencnr",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gopencnr/acceptable-use" },
    },
    {
      key: "project:gplatform-control:terms",
      product: "gplatform-control",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gplatform-control/terms" },
    },
    {
      key: "project:gplatform-sso:terms",
      product: "gplatform-sso",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gplatform-sso/terms" },
    },
    {
      key: "project:gplatform-billing:terms",
      product: "gplatform-billing",
      kind: "consent",
      liveUrl: { en: "https://gplatform.org/apps/gplatform-billing/terms" },
    },
  ],
  versions: [
    {
      versionId: "gcontrol-terms-2026-09-06",
      document: "project:gcontrol:terms",
      version: "2026-09-06",
      title: { en: "GControl terms", de: "GControl-Nutzungsbedingungen" },
      contentHash: "7beb414ea609b1e685decf34dc60450625e95a867fd531177de12713407ceced",
      archiveUrl: {
        en: "https://gplatform.org/legal/gcontrol-terms-2026-09-06",
        de: "https://gplatform.org/de/legal/gcontrol-terms-2026-09-06",
      },
      frozenAt: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
    },
    {
      versionId: "gadvisory-terms-2026-09-06",
      document: "project:gadvisory:terms",
      version: "2026-09-06",
      title: { en: "GAdvisory terms", de: "GAdvisory-Nutzungsbedingungen" },
      contentHash: "7fde0e3647ef2bcfc9435d23065070f3dd8090c2eebeaed869d8272d2e4cd4cf",
      archiveUrl: {
        en: "https://gplatform.org/legal/gadvisory-terms-2026-09-06",
        de: "https://gplatform.org/de/legal/gadvisory-terms-2026-09-06",
      },
      frozenAt: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
    },
    {
      versionId: "gs-terms-2026-09-06",
      document: "page:gs:terms",
      version: "2026-09-06",
      title: { en: "Terms of service", de: "Nutzungsbedingungen" },
      contentHash: "c0001c79df9c3598d7b0228bdf5f8de94a9e8bc259c14ecb551cbb284a72e596",
      archiveUrl: {
        en: "https://gplatform.org/legal/gs-terms-2026-09-06",
        de: "https://gplatform.org/de/legal/gs-terms-2026-09-06",
      },
      frozenAt: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
    },
    {
      versionId: "gopencdr-terms-2026-09-27",
      document: "project:gopencdr:terms",
      version: "2026-09-27",
      title: { en: "GOpenCDR terms", de: "GOpenCDR-Nutzungsbedingungen" },
      contentHash: "f04f255eb907a5f5d081fbc330ad9a7ebf4795d0046bf773316ee96120841cd9",
      archiveUrl: {
        en: "https://gplatform.org/legal/gopencdr-terms-2026-09-27",
        de: "https://gplatform.org/de/legal/gopencdr-terms-2026-09-27",
      },
      frozenAt: "2026-09-27T16:34:40Z", // 0.1.4: "2026-09-27 16:34:40", read as UTC
    },
    {
      versionId: "gopencdr-acceptable-use-2026-09-27",
      document: "project:gopencdr:acceptable-use",
      version: "2026-09-27",
      title: {
        en: "GOpenCDR acceptable use policy",
        de: "GOpenCDR-Richtlinie zur zulässigen Nutzung",
      },
      contentHash: "963ad05d98db5c130a6b85c93c4c9d5c565410c728842ac2fe073ad51fad7c2a",
      archiveUrl: {
        en: "https://gplatform.org/legal/gopencdr-acceptable-use-2026-09-27",
        de: "https://gplatform.org/de/legal/gopencdr-acceptable-use-2026-09-27",
      },
      frozenAt: "2026-09-27T16:34:33Z", // 0.1.4: "2026-09-27 16:34:33", read as UTC
    },
    {
      versionId: "gs-terms-2026-10-01",
      document: "page:gs:terms",
      version: "2026-10-01",
      title: { en: "Terms of service", de: "Nutzungsbedingungen" },
      contentHash: "9268392771e2f85e55c0354d1c261d26c77fc9b42fba87d6a796e02a2b593bad",
      archiveUrl: {
        en: "https://gplatform.org/legal/gs-terms-2026-10-01",
        de: "https://gplatform.org/de/legal/gs-terms-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:29Z", // 0.1.4: "2026-10-01 16:01:29", read as UTC
    },
    {
      versionId: "gcontrol-terms-2026-10-01",
      document: "project:gcontrol:terms",
      version: "2026-10-01",
      title: { en: "GControl terms", de: "GControl-Nutzungsbedingungen" },
      contentHash: "b120c7cc556b9f5cef590127ac2b35e69a500a130c6f4253d88c1f869d7e6bda",
      archiveUrl: {
        en: "https://gplatform.org/legal/gcontrol-terms-2026-10-01",
        de: "https://gplatform.org/de/legal/gcontrol-terms-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:30Z", // 0.1.4: "2026-10-01 16:01:30", read as UTC
    },
    {
      versionId: "gadvisory-terms-2026-10-01",
      document: "project:gadvisory:terms",
      version: "2026-10-01",
      title: { en: "GAdvisory terms", de: "GAdvisory-Nutzungsbedingungen" },
      contentHash: "6aa5c48b3ab93464710a0b86d372896dd93fbebd1584b5fac65f75b0b415a689",
      archiveUrl: {
        en: "https://gplatform.org/legal/gadvisory-terms-2026-10-01",
        de: "https://gplatform.org/de/legal/gadvisory-terms-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:30Z", // 0.1.4: "2026-10-01 16:01:30", read as UTC
    },
    {
      versionId: "gopencdr-terms-2026-10-01",
      document: "project:gopencdr:terms",
      version: "2026-10-01",
      title: { en: "GOpenCDR terms", de: "GOpenCDR-Nutzungsbedingungen" },
      contentHash: "f11f98332ee7278a449a0078f5b0c25deea7c7e3835eeaad2a735e5ff5ff1eeb",
      archiveUrl: {
        en: "https://gplatform.org/legal/gopencdr-terms-2026-10-01",
        de: "https://gplatform.org/de/legal/gopencdr-terms-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:30Z", // 0.1.4: "2026-10-01 16:01:30", read as UTC
    },
    {
      versionId: "gopencsr-terms-2026-10-01.2",
      document: "project:gopencsr:terms",
      version: "2026-10-01.2",
      title: { en: "GOpenCSR terms", de: "GOpenCSR-Nutzungsbedingungen" },
      contentHash: "bd9e52f4da83bb77290ef5700e202035f676de121c6381fba07e52ba7102bfce",
      archiveUrl: {
        en: "https://gplatform.org/legal/gopencsr-terms-2026-10-01.2",
        de: "https://gplatform.org/de/legal/gopencsr-terms-2026-10-01.2",
      },
      frozenAt: "2026-10-01T17:13:45Z", // 0.1.4: "2026-10-01 17:13:45", read as UTC
    },
    {
      versionId: "gopencsr-acceptable-use-2026-10-01.2",
      document: "project:gopencsr:acceptable-use",
      version: "2026-10-01.2",
      title: {
        en: "GOpenCSR acceptable use policy",
        de: "GOpenCSR-Richtlinie zur zulässigen Nutzung",
      },
      contentHash: "cdc56c6f9017c712c307a7a656fa2687dff7728bf997b15ae15b48890659c7a2",
      archiveUrl: {
        en: "https://gplatform.org/legal/gopencsr-acceptable-use-2026-10-01.2",
        de: "https://gplatform.org/de/legal/gopencsr-acceptable-use-2026-10-01.2",
      },
      frozenAt: "2026-10-01T17:13:45Z", // 0.1.4: "2026-10-01 17:13:45", read as UTC
    },
    {
      versionId: "gopencnr-terms-2026-10-01",
      document: "project:gopencnr:terms",
      version: "2026-10-01",
      title: { en: "GOpenCNR terms", de: "GOpenCNR-Nutzungsbedingungen" },
      contentHash: "89a21e91fbf78079490e954d09fd67d62b65142579253107e543a34e5398daec",
      archiveUrl: {
        en: "https://gplatform.org/legal/gopencnr-terms-2026-10-01",
        de: "https://gplatform.org/de/legal/gopencnr-terms-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:30Z", // 0.1.4: "2026-10-01 16:01:30", read as UTC
    },
    {
      versionId: "gopencnr-acceptable-use-2026-10-01",
      document: "project:gopencnr:acceptable-use",
      version: "2026-10-01",
      title: {
        en: "GOpenCNR acceptable use policy",
        de: "GOpenCNR-Richtlinie zur zulässigen Nutzung",
      },
      contentHash: "e218a00528f1162539bf757275a16febc98d881ff5d1bb88b6842bb1b54eced1",
      archiveUrl: {
        en: "https://gplatform.org/legal/gopencnr-acceptable-use-2026-10-01",
        de: "https://gplatform.org/de/legal/gopencnr-acceptable-use-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:30Z", // 0.1.4: "2026-10-01 16:01:30", read as UTC
    },
    {
      versionId: "gplatform-control-terms-2026-10-01",
      document: "project:gplatform-control:terms",
      version: "2026-10-01",
      title: { en: "GPlatform Control terms", de: "GPlatform-Control-Nutzungsbedingungen" },
      contentHash: "b37d7f4033e02096c68a92f9cec13364bbf7d0854e88df3ad7a017f5e8e8c360",
      archiveUrl: {
        en: "https://gplatform.org/legal/gplatform-control-terms-2026-10-01",
        de: "https://gplatform.org/de/legal/gplatform-control-terms-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:30Z", // 0.1.4: "2026-10-01 16:01:30", read as UTC
    },
    {
      versionId: "gplatform-sso-terms-2026-10-01",
      document: "project:gplatform-sso:terms",
      version: "2026-10-01",
      title: { en: "GPlatform SSO terms", de: "GPlatform-SSO-Nutzungsbedingungen" },
      contentHash: "afdeafaa0b6b90b29d2006b73d69f8423d7d84aee385321a886d47e964cb0ea1",
      archiveUrl: {
        en: "https://gplatform.org/legal/gplatform-sso-terms-2026-10-01",
        de: "https://gplatform.org/de/legal/gplatform-sso-terms-2026-10-01",
      },
      frozenAt: "2026-10-01T16:01:30Z", // 0.1.4: "2026-10-01 16:01:30", read as UTC
    },
  ],
  surfaces: [
    {
      id: "gcontrol",
      covers: ["project:gcontrol:terms", "page:gs:terms"],
      liveLinks: {},
    },
    {
      id: "gadvisory",
      covers: ["project:gadvisory:terms", "page:gs:terms"],
      liveLinks: {},
    },
    {
      id: "gopencdr",
      covers: ["project:gopencdr:terms", "project:gopencdr:acceptable-use", "page:gs:terms"],
      liveLinks: {},
    },
    {
      id: "gopencnr",
      covers: ["project:gopencnr:terms", "project:gopencnr:acceptable-use", "page:gs:terms"],
      liveLinks: {
        "project:gopencnr:terms": "https://gplatform.org/apps/gopencnr/terms",
        "project:gopencnr:acceptable-use": "https://gplatform.org/apps/gopencnr/acceptable-use",
      },
    },
    {
      id: "gopencsr",
      covers: ["project:gopencsr:terms", "project:gopencsr:acceptable-use", "page:gs:terms"],
      liveLinks: {
        "project:gopencsr:terms": "https://gplatform.org/apps/gopencsr/terms",
        "project:gopencsr:acceptable-use": "https://gplatform.org/apps/gopencsr/acceptable-use",
      },
    },
    {
      id: "gplatform-control",
      covers: ["project:gplatform-control:terms", "page:gs:terms"],
      liveLinks: {
        "project:gplatform-control:terms": "https://gplatform.org/apps/gplatform-control/terms",
      },
    },
    {
      id: "gplatform-billing",
      covers: ["project:gplatform-billing:terms", "page:gs:terms"],
      liveLinks: {
        "project:gplatform-billing:terms": "https://gplatform.org/apps/gplatform-billing/terms",
      },
    },
    {
      id: "gplatform-sso",
      covers: ["project:gplatform-sso:terms", "page:gs:terms"],
      liveLinks: {
        "project:gplatform-sso:terms": "https://gplatform.org/apps/gplatform-sso/terms",
      },
    },
  ],
  rollouts: [
    {
      versionId: "gcontrol-terms-2026-09-06",
      surface: null,
      announcedAt: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
      inForceFrom: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
    },
    {
      versionId: "gadvisory-terms-2026-09-06",
      surface: null,
      announcedAt: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
      inForceFrom: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
    },
    {
      versionId: "gs-terms-2026-09-06",
      surface: null,
      announcedAt: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
      inForceFrom: "2026-09-06T18:40:41Z", // 0.1.4: "2026-09-06 18:40:41", read as UTC
    },
    {
      versionId: "gopencdr-terms-2026-09-27",
      surface: null,
      announcedAt: "2026-09-27T16:34:40Z", // 0.1.4: "2026-09-27 16:34:40", read as UTC
      inForceFrom: "2026-09-27T16:34:40Z", // 0.1.4: "2026-09-27 16:34:40", read as UTC
    },
    {
      versionId: "gopencdr-acceptable-use-2026-09-27",
      surface: null,
      announcedAt: "2026-09-27T16:34:33Z", // 0.1.4: "2026-09-27 16:34:33", read as UTC
      inForceFrom: "2026-09-27T16:34:33Z", // 0.1.4: "2026-09-27 16:34:33", read as UTC
    },
    {
      versionId: "gs-terms-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "This version replaces the general terms of 6 September 2026. The main changes:\n- Your content: you keep all rights in it and give us a licence limited to running the service you submitted it to. We may pass it on only to the groups the terms name (our providers and products, the operators who carry it, the recipients of advisories, a successor, affiliated companies), never for their own purposes. It ends when you delete the content, except backups (kept up to 90 days) and permanent public records, which you are told about before you submit.\n- We may move your account to another sign-in service we run, such as GPlatform SSO, with 30 days' notice by email.\n- New versions: six weeks' notice by email, then you are asked to accept at your next sign-in. A new version applies to you only once you accept it. A free account that has not accepted after the six weeks is restricted to signing in, reading, exporting, data-protection requests, closing the account and accepting. Paid services are never restricted.\n- We restrict only on stated grounds and with a statement of reasons, and we hear you before suspending or ending an account, except in a closed list of urgent cases.\n- We change a service only for stated reasons and at no extra cost, and end a free service with at least 60 days' notice. Either of us may end a contract for a free service with four weeks' notice. After a contract ends you can export your data for 30 days.\n- A paid service is suspended for non-payment only after a reminder and 14 days, never for an amount you have properly disputed.\n- New clauses on signing up, sanctions, subcontractors, notices by email, set-off, a business customer's own terms not applying, and jurisdiction. Consumers keep their home country's mandatory protection.\n- You get an express right to use the hosted services. Software you run yourself stays under its own licence.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Fassung ersetzt die allgemeinen Nutzungsbedingungen vom 6. September 2026. Die wesentlichen Änderungen:\n- Ihre Inhalte: Sie behalten alle Rechte daran und räumen uns ein Nutzungsrecht ein, das auf den Betrieb des Dienstes beschränkt ist, in dem Sie sie eingereicht haben. Weiter einräumen dürfen wir es nur den in den Bedingungen genannten Gruppen (unseren Dienstleistern und Produkten, den Betreibern, die die Inhalte weitertragen, den Empfängern von Advisories, einem Rechtsnachfolger, verbundenen Unternehmen), nie zu deren eigenen Zwecken. Es endet, wenn Sie die Inhalte löschen; ausgenommen sind Sicherungen (bis zu 90 Tage) und dauerhafte öffentliche Aufzeichnungen, auf die Sie vor dem Einreichen hingewiesen werden.\n- Wir können Ihr Konto mit einer Frist von 30 Tagen per E-Mail zu einem anderen Anmeldedienst umziehen, den wir betreiben, etwa GPlatform SSO.\n- Neue Fassungen: Ankündigung mindestens sechs Wochen vorher per E-Mail, danach werden Sie bei Ihrer nächsten Anmeldung um Zustimmung gebeten. Eine neue Fassung gilt für Sie erst, wenn Sie ihr zustimmen. Ein kostenloses Konto, das nach Ablauf der sechs Wochen nicht zugestimmt hat, ist auf Anmelden, Lesen, Exportieren, Datenschutzanliegen, das Schließen des Kontos und die Zustimmung beschränkt. Entgeltliche Dienste werden nie eingeschränkt.\n- Wir beschränken nur aus genannten Gründen und mit Begründung, und bevor wir ein Konto sperren oder beenden, hören wir Sie an, außer in einer abschließenden Liste dringender Fälle.\n- Einen Dienst ändern wir nur aus genannten Gründen und ohne Mehrkosten, und einen kostenlosen Dienst stellen wir mit einer Frist von mindestens 60 Tagen ein. Den Vertrag über einen kostenlosen Dienst kann jede Seite mit einer Frist von vier Wochen kündigen. Nach Vertragsende können Sie Ihre Daten 30 Tage lang exportieren.\n- Einen entgeltlichen Dienst setzen wir wegen ausbleibender Zahlung nur nach einer Mahnung und 14 Tagen aus, nie wegen eines Betrags, den Sie mit Gründen bestritten haben.\n- Neue Klauseln zu Registrierung, Sanktionen, Unterauftragnehmern, Mitteilungen per E-Mail, Aufrechnung, dem Ausschluss eigener Bedingungen von Geschäftskunden und zum Gerichtsstand. Verbraucher behalten den zwingenden Schutz ihres Wohnsitzlandes.\n- Sie erhalten ausdrücklich ein Recht zur Nutzung der gehosteten Dienste. Software, die Sie selbst betreiben, bleibt unter ihrer eigenen Lizenz.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gcontrol-terms-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "This version replaces the GControl terms of 6 September 2026. The main changes:\n- A new section says how the general terms' new clauses apply to software you run. Nothing in them restricts GControl's licence or your rights under Sections 69d and 69e UrhG.\n- The content licence covers only what your instance sends us (the heartbeat, the enrolment ledger, command results, diagnostics you turn on, support bundles and what a support session you approve shows us), used only for licensing, the catalogue, updates and support. The stamps on your install are kept for good.\n- Restrictions and suspension reach only the hosted services, never your instance. A lapsed tier or entitlement for an unpaid amount follows only a reminder and 14 days, and Freeze and Seal are still never used because of a payment.\n- A change to the terms never restricts your instance or its licence. A free enrolment in GPlatform Control that has not accepted new terms after six weeks is restricted, while your instance keeps running on the base tier. A paid enrolment never is.\n- Enrolling costs nothing on the free base tier.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Fassung ersetzt die GControl-Bedingungen vom 6. September 2026. Die wesentlichen Änderungen:\n- Ein neuer Abschnitt sagt, wie die neuen Klauseln der allgemeinen Nutzungsbedingungen für Software gelten, die Sie selbst betreiben. Nichts darin schränkt die Lizenz von GControl oder Ihre Rechte aus §§ 69d, 69e UrhG ein.\n- Das Nutzungsrecht an Inhalten umfasst nur, was Ihre Instanz uns sendet (den Heartbeat, das Register bei der Einschreibung, Befehlsergebnisse, Diagnosedaten, wenn Sie sie einschalten, Support-Pakete und was uns eine von Ihnen genehmigte Support-Sitzung zeigt), und wird nur für Lizenzierung, Katalog, Aktualisierungen und Support genutzt. Die Stamps Ihrer Installation bleiben dauerhaft erhalten.\n- Einschränkungen und Sperren erreichen nur die gehosteten Dienste, nie Ihre Instanz. Dass eine Stufe oder Berechtigung wegen eines offenen Betrags entfällt, geschieht erst nach einer Mahnung und 14 Tagen, und Freeze und Seal werden weiterhin nie wegen einer Zahlung eingesetzt.\n- Eine Änderung der Bedingungen schränkt weder Ihre Instanz noch ihre Lizenz ein. Eine kostenfreie Einschreibung in GPlatform Control, die neuen Bedingungen nach Ablauf der sechs Wochen nicht zugestimmt hat, wird eingeschränkt, während Ihre Instanz auf der Basisstufe weiterläuft. Eine bezahlte Einschreibung nie.\n- Die Einschreibung kostet auf der kostenfreien Basisstufe nichts.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gadvisory-terms-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "This version replaces the GAdvisory terms of 6 September 2026. The main changes:\n- A new section says how the general terms' new clauses apply to hosted GAdvisory. None of it applies to an instance you run yourself, which stays under its own licence.\n- The content licence covers what you submit. To publish an advisory we may edit, summarise and translate a report, crediting you as you choose, and so may the affected vendor or maintainer. It goes only to our providers (including the AI providers the terms name), the recipients of an advisory, a successor and affiliated companies.\n- Published advisories and their CVE records are permanent: they can be withdrawn or rejected but not deleted, and you grant a licence without time limit to copy and publish them as part of that record.\n- Hosted GAdvisory moves from gadvisory.org to advisory.gplatform.org, and sign-in moves to GPlatform SSO. Each move is emailed at least 30 days ahead, and if it makes your access materially harder you may end the contract free of charge within 30 days.\n- We reduce what a plan gives you only for a stated reason, with notice and at no extra cost. A lower cap never removes what exists.\n- We may restrict or suspend an account for a breach of acceptable use. We say why no later than when it takes effect, and hear you before suspending or ending it, except in urgent cases.\n- If hosted GAdvisory or your contract ends, you can export your data for 30 days.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Fassung ersetzt die GAdvisory-Nutzungsbedingungen vom 6. September 2026. Die wesentlichen Änderungen:\n- Ein neuer Abschnitt sagt, wie die neuen Klauseln der allgemeinen Nutzungsbedingungen für das gehostete GAdvisory gelten. Für eine Instanz, die Sie selbst betreiben, gilt nichts davon; sie bleibt unter ihrer eigenen Lizenz.\n- Das Nutzungsrecht an Inhalten umfasst, was Sie einreichen. Um ein Advisory zu veröffentlichen, dürfen wir eine Meldung bearbeiten, zusammenfassen und übersetzen und Sie so nennen, wie Sie es wählen; dasselbe darf der betroffene Hersteller oder Maintainer. Es erhalten nur unsere Dienstleister (einschließlich der in den Bedingungen genannten KI-Anbieter), die Empfänger eines Advisories, ein Rechtsnachfolger und verbundene Unternehmen.\n- Veröffentlichte Advisories und ihre CVE-Einträge sind dauerhaft: Sie können zurückgezogen oder abgelehnt, aber nicht gelöscht werden, und Sie räumen ein zeitlich unbegrenztes Recht ein, sie als Teil dieser Aufzeichnung zu vervielfältigen und zu veröffentlichen.\n- Das gehostete GAdvisory zieht von gadvisory.org nach advisory.gplatform.org um, und die Anmeldung wechselt zu GPlatform SSO. Jeder Umzug wird mindestens 30 Tage vorher per E-Mail angekündigt, und erschwert er Ihren Zugang wesentlich, können Sie den Vertrag innerhalb von 30 Tagen kostenfrei beenden.\n- Was ein Plan Ihnen gibt, verringern wir nur aus einem genannten Grund, mit Ankündigung und ohne Mehrkosten. Eine niedrigere Obergrenze entfernt nichts Bestehendes.\n- Bei einem Verstoß gegen die zulässige Nutzung können wir ein Konto einschränken oder sperren. Den Grund nennen wir spätestens, wenn die Maßnahme wirkt, und bevor wir ein Konto sperren oder beenden, hören wir Sie an, außer in dringenden Fällen.\n- Endet das gehostete GAdvisory oder Ihr Vertrag, können Sie Ihre Daten 30 Tage lang exportieren.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gopencdr-terms-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "This version replaces the GOpenCDR terms of 27 September 2026. The main changes:\n- Your account is now your G Open account, kept by GOpenCSR at csr.gplatform.org and governed by the GOpenCSR terms and acceptable use policy. These terms govern your names.\n- When you first hold a resource, for example by registering your first name, you give your legal name and country, which GOpenCSR screens against the EU sanctions list. They are never public and never in RDAP.\n- A possible sanctions match places automated holds (no new names, no transfers out, existing names keep working) until a person at Tier 0 has reviewed it.\n- Every report becomes a case in GOpenCSR. You get a statement of reasons no later than when a measure takes effect, and an appeal is heard by the GOpenCDR Registry Council (by Tier 0 until people are elected to its seats).\n- GOpenCDR's entries now go to the one transparency log GOpenCSR keeps at csr.gplatform.org/tlog, which also records every signed change to a name. Published zone data and log entries are permanent records.\n- The content licence covers your registration data, published zone data and your reports, passed on only to IONOS SE, GOpenCSR, TLD and mirror operators, log witnesses and mirrors, a successor and affiliated companies.\n- You may end the contract at any time. We may end it with four weeks' notice, or 60 days if GOpenCDR closes altogether, and you can have your data exported for 30 days afterwards.\n- GOpenCDR is free, so if you have not accepted new terms after six weeks your use is restricted until you do: your names keep resolving, but you cannot confirm them while it lasts.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Fassung ersetzt die GOpenCDR-Nutzungsbedingungen vom 27. September 2026. Die wesentlichen Änderungen:\n- Ihr Konto ist jetzt Ihr G-Open-Konto. GOpenCSR führt es unter csr.gplatform.org, und es unterliegt den GOpenCSR-Nutzungsbedingungen und der GOpenCSR-Richtlinie zur zulässigen Nutzung. Diese Bedingungen regeln Ihre Namen.\n- Wenn Sie zum ersten Mal Inhaber von Ressourcen werden, etwa mit der Registrierung Ihres ersten Namens, geben Sie Ihren bürgerlichen Namen und Ihr Land an, die GOpenCSR mit der Sanktionsliste der EU abgleicht. Sie sind nie öffentlich und nie in RDAP.\n- Ein möglicher Sanktionstreffer setzt automatisch Sperren (keine neuen Namen, keine Transfers nach außen, bestehende Namen funktionieren weiter), bis ein Mensch bei Tier 0 ihn geprüft hat.\n- Jede Meldung wird zu einem Fall in GOpenCSR. Sie erhalten spätestens mit dem Wirksamwerden einer Maßnahme eine Begründung, und über eine Anfechtung entscheidet der GOpenCDR-Registry-Rat (bis Menschen in seine Sitze gewählt sind, Tier 0).\n- Die Einträge von GOpenCDR gehen jetzt in das eine Transparenzlog, das GOpenCSR unter csr.gplatform.org/tlog führt und das auch jede signierte Änderung an einem Namen aufzeichnet. Veröffentlichte Zonendaten und Logeinträge sind dauerhafte Aufzeichnungen.\n- Das Nutzungsrecht an Inhalten umfasst Ihre Registrierungsdaten, die veröffentlichten Zonendaten und Ihre Meldungen und wird nur IONOS SE, GOpenCSR, TLD- und Mirror-Betreibern, den Zeugen und Spiegeln des Logs, einem Rechtsnachfolger und verbundenen Unternehmen weiter eingeräumt.\n- Sie können den Vertrag jederzeit beenden. Wir können ihn mit einer Frist von vier Wochen kündigen, oder mit 60 Tagen, wenn wir GOpenCDR insgesamt einstellen, und danach können Sie Ihre Daten 30 Tage lang exportieren lassen.\n- GOpenCDR ist unentgeltlich. Haben Sie neuen Bedingungen nach Ablauf der sechs Wochen nicht zugestimmt, wird Ihre Nutzung eingeschränkt, bis Sie zustimmen: Ihre Namen lösen weiter auf, aber solange die Einschränkung dauert, können Sie sie nicht bestätigen.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gopencsr-terms-2026-10-01.2",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "These terms cover your G Open account, which GOpenCSR now keeps, alongside the general terms.\n- Passkeys made for cdr.gplatform.org are refused after 31 October 2026, so enrol them again on csr.gplatform.org before then.\n- You sign each change to a registry object with your passkey or an automation key, and transparency-log entries and governance records stay public for good.\n- When you first become a holder of names or addresses, you give your legal name and country, seen only by Tier 0, for daily EU sanctions screening; a possible match automatically blocks new resources and transfers out until a person reviews it.\n- A person at Tier 0 decides restrictions, and you can appeal within six months to the Registry Council of the product concerned or, while Tier 0 holds its seats, to Tier 0.\n- While your account is restricted for not accepting new terms, you cannot reconfirm names or address space, so a reconfirmation falling due goes into grace and redemption.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Bedingungen regeln Ihr G-Open-Konto, das jetzt GOpenCSR führt, neben den allgemeinen Nutzungsbedingungen.\n- Passkeys für cdr.gplatform.org werden nach dem 31. Oktober 2026 abgelehnt; richten Sie sie vorher auf csr.gplatform.org neu ein.\n- Jede Änderung an einem Objekt einer Registry signieren Sie mit Passkey oder Automatisierungsschlüssel, und Einträge im Transparenzlog und Unterlagen der Governance bleiben dauerhaft öffentlich.\n- Werden Sie erstmals Inhaber von Namen oder Adressen, geben Sie Ihren bürgerlichen Namen und Ihr Land, die nur Tier 0 sieht, für den täglichen Abgleich mit der EU-Sanktionsliste an; ein möglicher Treffer sperrt automatisch neue Ressourcen und Transfers nach außen, bis ein Mensch ihn prüft.\n- Über Einschränkungen entscheidet ein Mensch bei Tier 0, und Sie können sie binnen sechs Monaten beim Registry-Rat des betroffenen Produkts oder, solange Tier 0 dessen Sitze hält, bei Tier 0 anfechten.\n- Solange Ihr Konto wegen nicht angenommener neuer Bedingungen eingeschränkt ist, können Sie Namen und Adressraum nicht bestätigen, und eine fällige Bestätigung läuft in Nachfrist und Wiederherstellungsfrist.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gopencsr-acceptable-use-2026-10-01.2",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "This policy covers your G Open account and what you do in GOpenCSR, alongside the general terms.\n- Do not share your account or credentials, automate only with API keys and automation keys, and do not use further or borrowed accounts to get around a restriction or multiply support for a motion.\n- Criticism, including of us, is welcome, but posts may not contain unlawful content, harassment, doxxing, spam, impersonation or confidential matters.\n- Report abuse only in good faith, and as a holder, answer reports without acting against the reporter.\n- Do not probe the services outside the disclosure policies, get around their controls, harvest data in bulk or try to learn what is withheld.\n- A breach can lead to removed posts, revoked keys, suspension or, if serious or repeated, closure.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Richtlinie regelt Ihr G-Open-Konto und Ihr Handeln in GOpenCSR, neben den allgemeinen Nutzungsbedingungen.\n- Teilen Sie Konto und Zugangsdaten nicht, automatisieren Sie nur mit API-Schlüsseln und Automatisierungsschlüsseln, und nutzen Sie keine weiteren oder fremden Konten, um eine Einschränkung zu umgehen oder Unterstützung für einen Antrag zu vervielfachen.\n- Kritik, auch an uns, ist willkommen, aber Beiträge dürfen nichts Rechtswidriges, keine Belästigung, kein Doxxing, keinen Spam, keine Identitätstäuschung und nichts Vertrauliches enthalten.\n- Melden Sie Missbrauch nur in gutem Glauben, und beantworten Sie als Inhaber Meldungen, ohne gegen die meldende Person vorzugehen.\n- Forschen Sie die Dienste nicht außerhalb der Offenlegungsrichtlinien aus, umgehen Sie keine Kontrollen, sammeln Sie keine Daten in großem Umfang ab und versuchen Sie nicht, Zurückgehaltenes zu erfahren.\n- Ein Verstoß kann dazu führen, dass Beiträge entfernt, Schlüssel widerrufen und Konten ausgesetzt oder, bei schweren oder wiederholten Verstößen, geschlossen werden.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gopencnr-terms-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "These terms apply to you as a GOpenCNR member, alongside the general terms and the GOpenCSR terms; membership is free.\n- Addresses and ASNs are allocated, never owned, and a transfer is never made for payment.\n- Reconfirm your space every 12 months or it is reclaimed after 30 days' grace and 30 days' redemption; while your use is restricted for not accepting new terms, you cannot reconfirm.\n- Space never announced for 12 months is reclaimed 90 days after a warning unless you announce it.\n- The sanctions ladder runs from a warning to reclaiming an allocation, each step decided by a person at Tier 0 and lasting at least 7 days, and you can appeal within six months.\n- Your handle, prefixes, origin ASN and abuse relay address are public and the registry's public history is kept for good; your endpoints, audiences, legal name and country are never public.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Bedingungen gelten für Sie als Mitglied von GOpenCNR, neben den allgemeinen und den GOpenCSR-Nutzungsbedingungen; die Mitgliedschaft ist unentgeltlich.\n- Adressen und ASNs werden zugeteilt, nie Eigentum, und ein Transfer erfolgt nie gegen Bezahlung.\n- Bestätigen Sie Ihren Adressraum alle 12 Monate, sonst wird er nach 30 Tagen Nachfrist und 30 Tagen Wiederherstellungsfrist zurückgenommen; solange Ihre Nutzung wegen nicht angenommener neuer Bedingungen eingeschränkt ist, können Sie nicht bestätigen.\n- Adressraum, der 12 Monate lang nie angekündigt wurde, wird 90 Tage nach einer Mahnung zurückgenommen, wenn Sie ihn nicht ankündigen.\n- Die Sanktionsstufen reichen von einer Verwarnung bis zur Rücknahme einer Zuteilung; jede entscheidet ein Mensch bei Tier 0, jede dauert mindestens 7 Tage, und Sie können binnen sechs Monaten anfechten.\n- Ihr Handle, Ihre Präfixe, Ihre Ursprungs-ASN und Ihre Missbrauchs-Weiterleitungsadresse sind öffentlich und die öffentliche Historie der Registry bleibt dauerhaft erhalten; Ihre Endpunkte, Zielgruppen, Ihr rechtlicher Name und Ihr Land sind nie öffentlich.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gopencnr-acceptable-use-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "This policy applies to you as a GOpenCNR member, alongside the GOpenCSR policy and the general terms.\n- Do not scan other members' space, and get the holder's consent before research that touches it; Tier 0 scans your own space on request.\n- Keep closed prefixes within their audience: no traffic across the boundary, no passing on closed routes and no sharing of inner WireGuard keys.\n- Act on an abuse report about your space within 48 hours, or 12 hours for an active attack; otherwise Tier 0 steps in.\n- Never carry traffic between the internet and other members, send only from your own space, and announce only what you hold.\n- Within an open case, Tier 0 may sample one packet in 1,000 from the reported source for up to 7 days, never its content.\n- A breach can lead to steps of the sanctions ladder up to reclaiming an allocation, an emergency suspension or, if serious or repeated, consequences for your account.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Richtlinie gilt für Sie als Mitglied von GOpenCNR, neben der GOpenCSR-Richtlinie und den allgemeinen Nutzungsbedingungen.\n- Scannen Sie keine anderen Mitglieder, und holen Sie vor Forschung an fremdem Adressraum die Zustimmung des Inhabers ein; Ihren eigenen Adressraum scannt Tier 0 auf Anfrage.\n- Geschlossene Präfixe bleiben in ihrer Zielgruppe: kein Verkehr über die Grenze, keine Weitergabe geschlossener Routen und keine geteilten inneren WireGuard-Schlüssel.\n- Handeln Sie auf eine Meldung über Ihren Adressraum binnen 48 Stunden, bei einem aktiven Angriff binnen 12 Stunden, sonst greift Tier 0 ein.\n- Tragen Sie nie Verkehr zwischen dem Internet und anderen Mitgliedern, senden Sie nur aus Ihrem eigenen Adressraum und kündigen Sie nur an, was Sie halten.\n- In einem offenen Fall darf Tier 0 höchstens 7 Tage lang eines von 1.000 Paketen der gemeldeten Quelle erfassen, nie den Inhalt.\n- Ein Verstoß kann zu Sanktionsstufen bis zur Rücknahme einer Zuteilung, zu einer Notfallaussetzung oder, bei schweren oder wiederholten Verstößen, zu Folgen für das Konto führen.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gplatform-control-terms-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "This version replaces the GPlatform Control terms of 6 September 2026. The main changes:\n- We suspend only for non-payment, after a reminder and 14 days and never for a properly disputed amount (read access and export stay available), or for unlawful or damaging use, with reasons and a hearing first except in urgent cases.\n- Either of us may end a free enrolment with four weeks' notice by email. Good cause for us means the grounds for suspension and nothing else.\n- When it ends you may export what we hold about your instances for 30 days. Instance, licence and entitlement records and the stamps your instances carry are kept.\n- The content licence covers what your instances send, your support requests and bundles, what a support session shows us, and what is inside an application we host for you. It is used only to run GPlatform Control and passed only to our providers, our products for the same purpose, a successor and affiliated companies.\n- Sign-in moves to GPlatform SSO. The move is emailed at least 30 days ahead, and if access becomes materially harder you may end the arrangement free of charge within 30 days.\n- A free enrolment that has not accepted new terms after six weeks is restricted until it does, while your instance keeps running on the base tier. A paid enrolment is never restricted.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Fassung ersetzt die GPlatform-Control-Bedingungen vom 6. September 2026. Die wesentlichen Änderungen:\n- Wir setzen nur wegen Nichtzahlung aus, erst nach einer Mahnung und 14 Tagen und nie wegen eines begründet bestrittenen Betrags (Lesezugriff und Export bleiben möglich), oder wegen rechtswidriger oder schädigender Nutzung, mit Begründung und vorheriger Anhörung außer in dringenden Fällen.\n- Eine kostenfreie Einschreibung kann jede Seite mit einer Frist von 4 Wochen per E-Mail beenden. Ein wichtiger Grund meint für uns die Aussetzungsgründe und nichts sonst.\n- Nach dem Ende können Sie 30 Tage lang exportieren, was wir zu Ihren Instanzen halten. Instanz-, Lizenz- und Berechtigungsdatensätze sowie die Stamps Ihrer Instanzen bleiben erhalten.\n- Das Nutzungsrecht an Inhalten umfasst, was Ihre Instanzen senden, Ihre Support-Anfragen und Support-Pakete, was uns eine Support-Sitzung zeigt, und den Inhalt einer Anwendung, die wir für Sie hosten. Es wird nur für den Betrieb von GPlatform Control genutzt und nur unseren Dienstleistern, unseren Produkten zum selben Zweck, einem Rechtsnachfolger und verbundenen Unternehmen weiter eingeräumt.\n- Die Anmeldung wechselt zu GPlatform SSO. Der Umzug wird mindestens 30 Tage vorher per E-Mail angekündigt, und wird Ihr Zugang wesentlich erschwert, können Sie die Vereinbarung innerhalb von 30 Tagen kostenfrei beenden.\n- Eine kostenfreie Einschreibung, die neuen Bedingungen nach Ablauf der sechs Wochen nicht zugestimmt hat, wird eingeschränkt, bis sie zustimmt, während Ihre Instanz auf der Basisstufe weiterläuft. Eine bezahlte Einschreibung wird nie eingeschränkt.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
    {
      versionId: "gplatform-sso-terms-2026-10-01",
      surface: null,
      announcedAt: "2026-10-08T00:00:00+02:00",
      inForceFrom: "2026-11-20T00:00:00+01:00",
      summary: {
        en: "These terms govern your account in GPlatform SSO, the sign-in service for our products, alongside the general terms.\n- Our own products are told your display name, primary address, organisations and which other products you use; other organisations' applications ask you first and are never told which products you use.\n- An enterprise that manages accounts on the proven domain of your email address can force a password reset, remove your second factor or close your account, but only after you were told and could refuse.\n- Our support can act as you only with your consent, for at most seven days, and you are emailed after every such session.\n- An account suspended or ended here can sign in to none of our products, and closing yours does not delete what you made in them.\n- GPlatform SSO is free, and nothing you enter in it is published.\nYou may object to this change by email to contact@gplatform.org before 20 November 2026. If you object, the new version does not become part of your agreement, and either of us may end the agreement for that reason from that date.",
        de: "Diese Bedingungen gelten für Ihr Konto in GPlatform SSO, dem Anmeldedienst für unsere Produkte, neben den allgemeinen Nutzungsbedingungen.\n- Unsere eigenen Produkte erfahren Ihren Anzeigenamen, Ihre Hauptadresse, Ihre Organisationen und welche anderen Produkte Sie nutzen; Anwendungen anderer Organisationen fragen Sie vorher und erfahren nie, welche Produkte Sie nutzen.\n- Ein Enterprise, das Konten auf der nachgewiesenen Domain Ihrer Adresse verwaltet, kann eine Passwortrücksetzung erzwingen, Ihren zweiten Faktor entfernen oder Ihr Konto schließen, aber erst, nachdem Sie benachrichtigt wurden und ablehnen konnten.\n- Unser Support kann nur mit Ihrer Einwilligung als Sie handeln, höchstens sieben Tage lang, und nach jeder solchen Sitzung erhalten Sie eine E-Mail.\n- Ein hier gesperrtes oder beendetes Konto kann sich bei keinem unserer Produkte anmelden, und das Schließen Ihres Kontos löscht nicht, was Sie in ihnen geschaffen haben.\n- GPlatform SSO ist kostenlos, und nichts, was Sie hier eingeben, wird veröffentlicht.\nSie können dieser Änderung vor dem 20. November 2026 per E-Mail an contact@gplatform.org widersprechen. Widersprechen Sie, wird die neue Fassung nicht Teil Ihres Vertrages, und jede Seite kann den Vertrag aus diesem Grund zu diesem Datum beenden.",
      },
    },
  ],
};
