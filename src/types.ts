/**
 * TypeScript types for Construct app manifests and registry pointer files.
 *
 * These mirror the JSON Schema at
 * ./schemas/manifest.schema.json (canonical $schema URL for developers:
 * https://raw.githubusercontent.com/construct-computer/app-sdk/main/schemas/manifest.schema.json).
 */

/** Valid app category IDs. */
export type AppCategory =
  | 'productivity'
  | 'developer-tools'
  | 'communication'
  | 'finance'
  | 'media'
  | 'ai-tools'
  | 'data'
  | 'utilities'
  | 'integrations'
  | 'shopping'
  | 'games';

// ── Auth types ──────────────────────────────────────────────────────────────

/** A user-submitted credential field for api_key / bearer / basic schemes. */
export interface CredentialField {
  /** Key under which the submitted value is delivered to your server via `ctx.auth[name]`. */
  name: string;
  /** Label shown to users. */
  displayName: string;
  /** Input widget type. */
  type: 'text' | 'password';
  /** Whether the user must fill this in. */
  required: boolean;
  /** Hint text shown inside the field. */
  placeholder?: string;
  /** Help text shown below the field. */
  description?: string;
}

export interface OAuth2Scheme {
  type: 'oauth2';
  label?: string;
  /** OAuth authorization endpoint. */
  authorization_url: string;
  /** OAuth token exchange endpoint. */
  token_url: string;
  /** Required OAuth scopes. */
  scopes?: string[];
  /** Separator used when joining scopes in the authorization URL. @default " " */
  scope_separator?: string;
}

export interface ApiKeyScheme {
  type: 'api_key';
  label?: string;
  instructions?: string;
  fields: CredentialField[];
}

export interface BearerScheme {
  type: 'bearer';
  label?: string;
  instructions?: string;
  fields: CredentialField[];
}

export interface BasicScheme {
  type: 'basic';
  label?: string;
  instructions?: string;
  fields: CredentialField[];
}

export type AuthScheme = OAuth2Scheme | ApiKeyScheme | BearerScheme | BasicScheme;

/** Legacy flat OAuth2 shorthand. New apps should use `schemes[]`. */
export interface LegacyOAuth2 {
  authorization_url: string;
  token_url: string;
  scopes?: string[];
  scope_separator?: string;
}

// ── Manifest ────────────────────────────────────────────────────────────────

/** App manifest (manifest.json at the root of your app repo). */
export interface AppManifest {
  /** JSON Schema URL for IDE validation. Set to https://raw.githubusercontent.com/construct-computer/app-sdk/main/schemas/manifest.schema.json. */
  $schema?: string;

  /** Display name shown in the App Store and Launchpad. */
  name: string;

  /** Short one-line description shown in search results and app cards. */
  description: string;

  /** App author information. */
  author?: {
    name: string;
    url?: string;
  };

  /**
   * GitHub logins that gate registry PRs bumping this app's pinned commit and
   * can manage env vars via the developer dashboard.
   */
  owners?: string[];

  /** Relative path to the app icon. Defaults to `"icon.png"`. */
  icon?: string;

  /**
   * App categories for the store listing. Only the first entry is used;
   * extras are ignored.
   */
  categories?: AppCategory[];

  /** Searchable tags for discovery. */
  tags?: string[];

  /** UI configuration. Omit if the app is tools-only (no visual interface). */
  ui?: {
    /** Entry point relative to repo root. @default "ui/index.html" */
    entry?: string;
    /** Default window width in pixels. @default 800 */
    width?: number;
    /** Default window height in pixels. @default 600 */
    height?: number;
  };

  /**
   * Authentication configuration. Use `schemes[]` for new apps; the flat
   * `oauth2` field is a legacy single-scheme shorthand that's normalized
   * into a single-scheme `schemes[]` at the platform boundary.
   */
  auth?: {
    schemes?: AuthScheme[];
    oauth2?: LegacyOAuth2;
  };

  /** Declared permissions (informational — shown during install). */
  permissions?: {
    /** External domains this app connects to. */
    network?: string[];
    /** Max storage needed (e.g. "1MB"). */
    storage?: string;
  };

  /**
   * Pre-declared tool list for the store listing before first deploy.
   * Auto-discovered from the MCP server's `tools/list` on deploy if omitted.
   */
  tools?: Array<{
    /** Tool name. Must match `^[a-zA-Z_][a-zA-Z0-9_]*$`. */
    name: string;
    /** What the tool does. Shown in the store listing. */
    description?: string;
  }>;
}

// ── Registry pointer ────────────────────────────────────────────────────────

/**
 * Registry pointer file (apps/{app-id}.json in the app-registry repo).
 * This is NOT part of your app — it's what gets added to the registry when
 * publishing. Only `repo` and `versions` are used; any other fields are
 * ignored by the sync script.
 */
export interface RegistryPointer {
  /** Public GitHub HTTPS URL to your app repository. */
  repo: string;
  /** Published versions in chronological order. The last entry is "latest". */
  versions: Array<{
    /** Semver version string. */
    version: string;
    /** Full 40-char git commit SHA (or "PENDING" to skip during sync). */
    commit: string;
    /** ISO 8601 date of publication. */
    date: string;
  }>;
}
