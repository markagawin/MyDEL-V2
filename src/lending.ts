import { LendingAction, Transaction } from './types';

export const LENDING_CATEGORY_KEY = 'lending';

export function isLendingTransaction(tx: Transaction): boolean {
  return tx.category === LENDING_CATEGORY_KEY;
}

/** Undefined lendingAction (shouldn't normally happen, but mirrors savingsActionOf) means 'lend'. */
export function lendingActionOf(tx: Transaction): LendingAction {
  return tx.lendingAction ?? 'lend';
}

/** Positive for a new loan (money out), negative for a repayment (money back). */
export function lendingSignedAmount(tx: Transaction): number {
  return lendingActionOf(tx) === 'repaid' ? -tx.amount : tx.amount;
}

/** Lifetime total currently out on loan, across every borrower. */
export function computeTotalLent(transactions: Transaction[]): number {
  return transactions.filter(isLendingTransaction).reduce((sum, t) => sum + lendingSignedAmount(t), 0);
}

/** Per-borrower running balance: positive means they still owe you that much. Borrowers with no
 * lending transactions at all are simply absent, not zeroed. */
export function computeLentByBorrower(transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t of transactions) {
    if (!isLendingTransaction(t) || !t.borrowerId) continue;
    result[t.borrowerId] = (result[t.borrowerId] ?? 0) + lendingSignedAmount(t);
  }
  return result;
}
