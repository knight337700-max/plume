import type { TransactionManager, TransactionScope } from "../../../core/src/common/transaction.js";
import type { PlumeDatabase } from "../../../db/src/client.js";

type DrizzleLikeDatabase = Pick<PlumeDatabase, "transaction">;

export function createDrizzleTransactionManager(database: DrizzleLikeDatabase): TransactionManager {
  return {
    async withTransaction<T>(work: (transaction: TransactionScope) => Promise<T>): Promise<T> {
      return database.transaction(async (transaction) => work({ value: transaction, depth: 1 }));
    },
  };
}
