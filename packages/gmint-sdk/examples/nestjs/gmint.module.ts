/**
 * GMint in a NestJS service, replacing a local `tokenForInstallation` that held the GitHub App's
 * private key (GAdvisory's GithubAppTokenService). The app keeps its own per-scope installation
 * mapping and passes the tenant from the authenticated session; GMint checks its own ceiling and
 * the tenant again, so either side alone stops a confused deputy (GADVISORY-391).
 *
 * Type-checked against the package by `pnpm typecheck:examples`; not part of the build.
 */

import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Module,
  ServiceUnavailableException,
  type DynamicModule,
  type OnModuleDestroy,
} from "@nestjs/common";
import {
  GmintClient,
  GmintError,
  type GmintClientOptions,
  type GmintToken,
  type TokenRequest,
} from "@ghub/gmint-sdk";

export const GMINT_OPTIONS = Symbol("GMINT_OPTIONS");

/** One operation's needs: one installation, named repositories and permissions, one tenant. */
export interface InstallationTokenRequest extends TokenRequest {
  /** From the authenticated session, never from stored configuration or the request body. */
  tenant: string;
}

@Injectable()
export class GmintTokenService implements OnModuleDestroy {
  private readonly log = new Logger(GmintTokenService.name);
  private readonly client: GmintClient;

  constructor(@Inject(GMINT_OPTIONS) options: GmintClientOptions) {
    this.client = new GmintClient({
      ...options,
      // A certificate that runs out cannot be renewed any more, only enrolled again: page someone.
      onRenewError: (e) => this.log.error(`GMint certificate renewal failed: ${e.message}`),
    });
  }

  /**
   * A token for exactly this request. Use it with `await using` so it is revoked on GitHub when
   * the block ends, and pass `token.reveal()` straight to the call that needs it.
   */
  async tokenForInstallation(req: InstallationTokenRequest): Promise<GmintToken> {
    try {
      return await this.client.getToken(req);
    } catch (e) {
      if (!(e instanceof GmintError)) throw e;
      switch (e.code) {
        case "locked_down":
          // Distinct on purpose: say GitHub access is locked down, not that something is broken.
          throw new ServiceUnavailableException("GitHub access is locked down");
        case "denied":
        case "quarantined":
          throw new ForbiddenException("not allowed for this installation");
        case "untrusted":
          // A response failed verification: treat it as an attack, not an outage.
          this.log.error(`GMint response failed verification: ${e.message}`);
          throw new InternalServerErrorException();
        default:
          throw new ServiceUnavailableException(e.retryable ? "try again later" : e.code);
      }
    }
  }

  onModuleDestroy(): void {
    this.client.close();
  }
}

@Module({})
export class GmintModule {
  static forRoot(options: GmintClientOptions): DynamicModule {
    return {
      module: GmintModule,
      providers: [{ provide: GMINT_OPTIONS, useValue: options }, GmintTokenService],
      exports: [GmintTokenService],
    };
  }
}

/** How a git sync calls it: the scope's own installation and repository, read only. */
export async function fetchScope(
  gmint: GmintTokenService,
  session: { scopeId: string },
  row: { installationId: number; repositoryId: number },
  fetch: (auth: string) => Promise<void>,
): Promise<void> {
  await using token = await gmint.tokenForInstallation({
    grant: "gadvisory-git-sync",
    installationId: row.installationId,
    repositoryIds: [row.repositoryId],
    permissions: { contents: "read" },
    tenant: session.scopeId,
    purpose: `git-sync scope ${session.scopeId}`,
  });
  await fetch(token.reveal());
}
