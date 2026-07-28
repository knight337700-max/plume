export type NestedTransactionMode = "savepoint" | "reuse";

export interface TransactionScope<T = unknown> {
  readonly value: T;
  readonly depth: number;
}

export interface TransactionManager<TTransaction = unknown> {
  withTransaction<T>(
    work: (transaction: TransactionScope<TTransaction>) => Promise<T>,
    options?: { readonly nested?: NestedTransactionMode },
  ): Promise<T>;
}
