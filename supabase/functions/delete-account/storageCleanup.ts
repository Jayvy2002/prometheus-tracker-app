export const ACCOUNT_STORAGE_BUCKETS = [
  "avatars",
  "product-images",
  "progress-photos",
  "qualification-proofs",
] as const;

export const LIST_PAGE = 1000;
export const REMOVE_BATCH = 100;
export const LIST_HARD_CAP = 50_000;

export type StorageCleanupReason = "list_failed" | "remove_failed" | "truncated";

export class StorageCleanupError extends Error {
  readonly reason: StorageCleanupReason;
  constructor(reason: StorageCleanupReason, message: string) {
    super(message);
    this.name = "StorageCleanupError";
    this.reason = reason;
  }
}

export type StorageListEntry = { name?: string; id?: string | null };

export type StorageApiError = {
  message: string;
  status?: number;
  statusCode?: string | number;
};

export type StorageBucketApi = {
  list(
    prefix: string,
    options: { limit: number; offset: number },
  ): Promise<{ data: StorageListEntry[] | null; error: StorageApiError | null }>;
  remove(paths: string[]): Promise<{ error: StorageApiError | null }>;
};

export type AccountStorageClient = {
  storage: {
    from: (bucket: string) => StorageBucketApi;
  };
};

export type CleanupOptions = {
  pageSize?: number;
  hardCap?: number;
  removeBatch?: number;
  buckets?: readonly string[];
};

export function isMissingBucketError(error: StorageApiError | null | undefined): boolean {
  if (!error) return false;
  const status = Number(error.status ?? error.statusCode);
  const message = error.message.toLowerCase();
  if (status === 404 && (message.includes("bucket") || message.includes("not found"))) {
    return true;
  }
  return /bucket not found/i.test(error.message) || /bucket .* does not exist/i.test(error.message);
}

export async function listOwnedStoragePaths(
  adminClient: AccountStorageClient,
  bucket: string,
  prefix: string,
  options: CleanupOptions = {},
): Promise<string[]> {
  const pageSize = options.pageSize ?? LIST_PAGE;
  const hardCap = options.hardCap ?? LIST_HARD_CAP;
  const files: string[] = [];
  let offset = 0;
  for (;;) {
    const { data: entries, error: listError } = await adminClient.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset });
    if (listError) {
      if (isMissingBucketError(listError)) return [];
      throw new StorageCleanupError(
        "list_failed",
        `${bucket}:${prefix}: list failed (${listError.message})`,
      );
    }
    const page = (entries ?? []) as StorageListEntry[];
    for (const entry of page) {
      if (!entry.name) continue;
      const path = `${prefix}/${entry.name}`;
      if (!entry.id) {
        files.push(...await listOwnedStoragePaths(adminClient, bucket, path, options));
      } else {
        files.push(path);
      }
    }
    if (page.length < pageSize) break;
    offset += pageSize;
    if (offset > hardCap) {
      throw new StorageCleanupError(
        "truncated",
        `${bucket}:${prefix}: truncated after ${hardCap} listings`,
      );
    }
  }
  return files;
}

export async function cleanupOwnedAccountStorage(
  adminClient: AccountStorageClient,
  userId: string,
  options: CleanupOptions = {},
): Promise<{ removed: number }> {
  const buckets = options.buckets ?? ACCOUNT_STORAGE_BUCKETS;
  const removeBatch = options.removeBatch ?? REMOVE_BATCH;
  let removed = 0;
  for (const bucket of buckets) {
    const paths = await listOwnedStoragePaths(adminClient, bucket, userId, options);
    for (let i = 0; i < paths.length; i += removeBatch) {
      const batch = paths.slice(i, i + removeBatch);
      const { error: removeError } = await adminClient.storage.from(bucket).remove(batch);
      if (removeError) {
        throw new StorageCleanupError(
          "remove_failed",
          `${bucket}: remove failed (${removeError.message})`,
        );
      }
      removed += batch.length;
    }
  }
  return { removed };
}

export async function deleteAuthUserAfterStorageCleanup(
  adminClient: AccountStorageClient,
  userId: string,
  deleteAuthUser: (id: string) => Promise<{ error: { message: string } | null }>,
  options: CleanupOptions = {},
): Promise<{ removed: number }> {
  const result = await cleanupOwnedAccountStorage(adminClient, userId, options);
  const { error } = await deleteAuthUser(userId);
  if (error) throw new Error(error.message);
  return result;
}
