/**
 * TypeScript types for Construct app manifests.
 */

/** App manifest (manifest.json at the root of your app repo). */
export interface AppManifest {
  /** Display name shown in the App Store and Launchpad. */
  name: string;

  /** Short description (1-2 sentences). Shown in search results and app cards. */
  description: string;

  /** App author information. */
  author?: {
    name: string;
    url?: string;
  };

  /** Relative path to the app icon (256x256 PNG or SVG recommended). */
  icon?: string;

  /**
   * App categories for the store listing.
   * @see https://registry.construct.computer/publish for the full list.
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

  /** OAuth configuration. Omit if the app doesn't require user authentication. */
  auth?: {
    oauth2?: {
      /** OAuth authorization endpoint. */
      authorization_url: string;
      /** OAuth token exchange endpoint. */
      token_url: string;
      /** Required OAuth scopes. */
      scopes?: string[];
    };
  };

  /** Declared permissions (informational — shown during install). */
  permissions?: {
    /** External domains this app connects to. */
    network?: string[];
    /** Max storage needed (e.g., "1MB"). */
    storage?: string;
  };
}

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

/**
 * Registry pointer file (apps/{app-id}.json in the app-registry repo).
 * This is NOT part of your app — it's what gets added to the registry when publishing.
 */
export interface RegistryPointer {
  /** Public GitHub HTTPS URL to your app repository. */
  repo: string;
  /** Short description (can differ from manifest — used for registry search). */
  description: string;
  /** Published versions in chronological order. */
  versions: Array<{
    /** Semver version string. */
    version: string;
    /** Full 40-char git commit SHA (or "PENDING" to skip). */
    commit: string;
    /** ISO 8601 date of publication. */
    date: string;
  }>;
}
