export type CategoryKey = string;

export interface CustomCategory {
  key: string;
  label: string;
  icon: string;
  color: string;
}

export type SavingsAction = 'deposit' | 'withdrawal';

/** 'credit' means this purchase was charged to the card, not paid in cash yet. */
export type PaymentMethod = 'cash' | 'credit';

/** 'lend' is money going out to someone; 'repaid' is them paying it back. */
export type LendingAction = 'lend' | 'repaid';

export interface Borrower {
  id: string;
  name: string;
}

export interface Transaction {
  id: string;
  amount: number;
  category: CategoryKey;
  note?: string;
  timestamp: string; // ISO string
  cycleIdentifier: string;
  recurringSourceId?: string; // set when auto-logged from a RecurringEntry
  savingsAction?: SavingsAction; // only meaningful when category === 'savings'; undefined on older entries means 'deposit'
  paymentMethod?: PaymentMethod; // 'credit' only when charged to the card; absent/'cash' otherwise
  lendingAction?: LendingAction; // only meaningful when category === 'lending'; undefined means 'lend'
  borrowerId?: string; // only meaningful when category === 'lending'
}

export interface RecurringEntry {
  id: string;
  amount: number;
  category: CategoryKey;
  note?: string;
}

export type CycleMode = 'monthly' | 'semiA' | 'semiB' | 'custom' | 'customRange' | 'customDates';

export interface CycleSettings {
  mode: CycleMode;
  customDay: number; // day-of-month (1-28) derived from customAnchorDate; used when mode === 'custom'
  customAnchorDate: string; // "yyyy-MM-dd" date the user picked; its day-of-month drives the recurring reset
  customRangeStart: string; // "yyyy-MM-dd"; used when mode === 'customRange'
  customRangeEnd: string; // "yyyy-MM-dd", inclusive; its length repeats indefinitely from customRangeStart
  customDates: string[]; // "yyyy-MM-dd" payout dates, used when mode === 'customDates'; each cycle runs from one payout date to the day before the next
}

export interface CycleRange {
  start: Date;
  end: Date;
  identifier: string;
  label: string;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  transactions: Transaction[];
  settings: CycleSettings;
  trackingStartDate: string | null;
  paychecks: Record<string, number>;
  customCategories: CustomCategory[];
  recurringEntries: RecurringEntry[];
  profileName?: string;
  profilePhotoUri?: string | null;
  borrowers?: Borrower[];
}
