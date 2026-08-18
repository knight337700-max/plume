/**
 * Generic ordered multi-artifact primitives.
 *
 * The contract is intentionally platform-neutral. A channel-specific source
 * profile supplies field and asset rules; this layer only fixes cardinality,
 * identity, ordering, and manifest semantics.
 */
export const MULTI_ARTIFACT_MANIFEST_SCHEMA_VERSION = "1.0.0" as const;

export type MultiArtifactValue =
  | string
  | number
  | boolean
  | null
  | readonly MultiArtifactValue[]
  | { readonly [key: string]: MultiArtifactValue };

export type MultiArtifactFields = Readonly<Record<string, MultiArtifactValue>>;

export type MultiArtifactCollectionItem = Readonly<{
  id: string;
  sourceProfileId: string;
  assetId: string;
  fields: MultiArtifactFields;
  metadata?: Readonly<Record<string, MultiArtifactValue>>;
}>;

export type MultiArtifactCollection = Readonly<{
  items: readonly MultiArtifactCollectionItem[];
}>;

export type MultiArtifactManifestItem = Readonly<{
  itemId: string;
  index: number;
  artifactChecksum: string;
  pixelFingerprint: string;
  requestFingerprint: string;
  sourceProfileId: string;
  assetId: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  artifactPath: string;
}>;

export type MultiArtifactCollectionManifest = Readonly<{
  schemaVersion: typeof MULTI_ARTIFACT_MANIFEST_SCHEMA_VERSION;
  kind: "COLLECTION_MANIFEST";
  channel: string;
  placement: string;
  compositionMode: "PLATFORM_COMPOSED";
  artifactCardinality: "COLLECTION";
  sourceProfileId: string;
  collectionFingerprint: string;
  requestFingerprint: string;
  itemCount: number;
  items: readonly MultiArtifactManifestItem[];
  finalUiRendered: false;
  finalUiChecksum: null;
  partialPublish: false;
}>;
