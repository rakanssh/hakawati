import type { TaleSyncState } from "@/repositories/sync.repository";
import type { RemoteTale } from "@/services/sync";
import type { TaleHead } from "@/types/tale.type";

export type LibraryTaleItem =
  | {
      source: "local";
      localTale: TaleHead;
      sync?: {
        profileId: string;
        remoteTaleId: string;
        status: TaleSyncState["pendingStatus"];
        lastErrorCode: string | null;
      };
    }
  | {
      source: "remote";
      remoteTale: RemoteTale;
      profileId: string;
    };

export function mergeTaleLibrary(input: {
  localTales: TaleHead[];
  remoteTales: RemoteTale[];
  syncStates: TaleSyncState[];
  profileId: string;
}): LibraryTaleItem[] {
  const syncByLocalId = new Map(
    input.syncStates.map((state) => [state.localTaleId, state]),
  );
  const linkedRemoteIds = new Set(
    input.syncStates.map((state) => state.remoteTaleId),
  );
  return [
    ...input.localTales.map((localTale): LibraryTaleItem => {
      const syncState = syncByLocalId.get(localTale.id);
      return {
        source: "local",
        localTale,
        ...(syncState
          ? {
              sync: {
                profileId: syncState.profileId,
                remoteTaleId: syncState.remoteTaleId,
                status: syncState.pendingStatus,
                lastErrorCode: syncState.lastErrorCode,
              },
            }
          : {}),
      };
    }),
    ...input.remoteTales
      .filter((remoteTale) => !linkedRemoteIds.has(remoteTale.id))
      .map(
        (remoteTale): LibraryTaleItem => ({
          source: "remote",
          remoteTale,
          profileId: input.profileId,
        }),
      ),
  ].sort((left, right) => itemUpdatedAt(right) - itemUpdatedAt(left));
}

export function itemUpdatedAt(item: LibraryTaleItem): number {
  return item.source === "local"
    ? item.localTale.updatedAt
    : Date.parse(item.remoteTale.updatedAt) || 0;
}
