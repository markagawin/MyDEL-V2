import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  BackupData,
  Borrower,
  CategoryKey,
  CustomCategory,
  CycleRange,
  CycleSettings,
  LendingAction,
  PaymentMethod,
  RecurringEntry,
  SavingsAction,
  Transaction,
} from './types';
import { computeTotalSaved, SAVINGS_CATEGORY_KEY } from './savings';
import { computeCreditCardBalance } from './creditCard';
import { computeLentByBorrower, computeTotalLent, LENDING_CATEGORY_KEY } from './lending';
import { CATEGORIES, CATEGORY_MAP, CategoryMeta } from './categories';
import {
  DEFAULT_SETTINGS,
  loadBorrowers,
  loadCustomCategories,
  loadPaychecks,
  loadProfileName,
  loadProfilePhoto,
  loadRecurringEntries,
  loadSettings,
  loadTrackingStartDate,
  loadTransactions,
  saveBorrowers,
  saveCustomCategories,
  savePaychecks,
  saveProfileName,
  saveProfilePhoto,
  saveRecurringEntries,
  saveSettings,
  saveTrackingStartDate,
  saveTransactions,
} from './storage';
import {
  clipRangeToTrackingStart,
  getCurrentCycleRange,
  getCycleRangeForDate,
  parseCycleIdentifier,
  parseIsoDateOnly,
  toIsoDateOnly,
} from './cycleEngine';
import { generateId } from './uuid';

interface AppDataContextValue {
  loading: boolean;
  transactions: Transaction[];
  settings: CycleSettings;
  currentCycleRange: CycleRange;
  currentCycleIdentifier: string;
  currentPaycheck: number | null;
  totalSaved: number;
  creditCardBalance: number;
  totalLent: number;
  lentByBorrower: Record<string, number>;
  categories: CategoryMeta[];
  categoryMap: Record<string, CategoryMeta>;
  recurringEntries: RecurringEntry[];
  borrowers: Borrower[];
  profileName: string;
  profilePhotoUri: string | null;
  setProfileName: (name: string) => Promise<void>;
  setProfilePhotoUri: (uri: string | null) => Promise<void>;
  addTransaction: (input: {
    amount: number;
    category: CategoryKey;
    note?: string;
    timestamp?: Date;
    savingsAction?: SavingsAction;
    paymentMethod?: PaymentMethod;
    lendingAction?: LendingAction;
    borrowerId?: string;
  }) => string;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransaction: (
    id: string,
    input: {
      amount: number;
      category: CategoryKey;
      note?: string;
      timestamp?: Date;
      savingsAction?: SavingsAction;
      paymentMethod?: PaymentMethod;
      lendingAction?: LendingAction;
      borrowerId?: string;
    }
  ) => Promise<void>;
  updateSettings: (settings: CycleSettings) => Promise<void>;
  setCurrentPaycheck: (amount: number | null) => Promise<void>;
  addCategory: (input: { label: string; icon: string; color: string }) => Promise<void>;
  updateCategory: (key: string, input: { label: string; icon: string; color: string }) => Promise<void>;
  removeCategory: (key: string) => Promise<void>;
  addRecurringEntry: (input: { amount: number; category: CategoryKey; note?: string }) => Promise<void>;
  removeRecurringEntry: (id: string) => Promise<void>;
  addBorrower: (name: string) => string;
  removeBorrower: (id: string) => Promise<void>;
  exportBackup: () => BackupData;
  restoreFromBackup: (data: BackupData) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'category';
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<CycleSettings>(DEFAULT_SETTINGS);
  const [trackingStartDate, setTrackingStartDate] = useState<string | null>(null);
  const [paychecks, setPaychecks] = useState<Record<string, number>>({});
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [recurringEntries, setRecurringEntries] = useState<RecurringEntry[]>([]);
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [profileName, setProfileNameState] = useState('');
  const [profilePhotoUri, setProfilePhotoUriState] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [
        tx,
        s,
        trackingStart,
        storedPaychecks,
        storedCustomCategories,
        storedRecurring,
        storedProfileName,
        storedProfilePhoto,
        storedBorrowers,
      ] = await Promise.all([
        loadTransactions(),
        loadSettings(),
        loadTrackingStartDate(),
        loadPaychecks(),
        loadCustomCategories(),
        loadRecurringEntries(),
        loadProfileName(),
        loadProfilePhoto(),
        loadBorrowers(),
      ]);
      setTransactions(tx);
      setSettings(s);
      setPaychecks(storedPaychecks);
      setCustomCategories(storedCustomCategories);
      setRecurringEntries(storedRecurring);
      setProfileNameState(storedProfileName);
      setProfilePhotoUriState(storedProfilePhoto);
      setBorrowers(storedBorrowers);
      if (trackingStart) {
        setTrackingStartDate(trackingStart);
      } else {
        const today = toIsoDateOnly(new Date());
        setTrackingStartDate(today);
        saveTrackingStartDate(today);
      }
      setLoading(false);
    })();
  }, []);

  const trackingStartAsDate = useMemo(
    () => (trackingStartDate ? parseIsoDateOnly(trackingStartDate) : null),
    [trackingStartDate]
  );

  const currentCycleRange = useMemo(
    () => getCurrentCycleRange(settings, trackingStartAsDate),
    [settings, trackingStartAsDate]
  );

  const categories = useMemo(() => [...CATEGORIES, ...customCategories], [customCategories]);

  const categoryMap = useMemo(() => {
    const map: Record<string, CategoryMeta> = { ...CATEGORY_MAP };
    for (const cat of customCategories) {
      map[cat.key] = cat;
    }
    return map;
  }, [customCategories]);

  const addTransaction = useCallback<AppDataContextValue['addTransaction']>(
    ({ amount, category, note, timestamp, savingsAction, paymentMethod, lendingAction, borrowerId }) => {
      const when = timestamp ?? new Date();
      const cycleIdentifier = timestamp
        ? clipRangeToTrackingStart(getCycleRangeForDate(when, settings), trackingStartAsDate)
            .identifier
        : currentCycleRange.identifier;
      const isLending = category === LENDING_CATEGORY_KEY;
      const tx: Transaction = {
        id: generateId(),
        amount,
        category,
        note: note && note.trim().length > 0 ? note.trim() : undefined,
        timestamp: when.toISOString(),
        cycleIdentifier,
        savingsAction: category === SAVINGS_CATEGORY_KEY ? savingsAction ?? 'deposit' : undefined,
        paymentMethod: paymentMethod === 'credit' ? 'credit' : undefined,
        lendingAction: isLending ? lendingAction ?? 'lend' : undefined,
        borrowerId: isLending ? borrowerId : undefined,
      };
      setTransactions((prev) => {
        const next = [tx, ...prev];
        saveTransactions(next);
        return next;
      });
      return tx.id;
    },
    [currentCycleRange, settings, trackingStartAsDate]
  );

  const deleteTransaction = useCallback(async (id: string) => {
    setTransactions((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTransactions(next);
      return next;
    });
  }, []);

  const updateTransaction = useCallback(
    async (
      id: string,
      input: {
        amount: number;
        category: CategoryKey;
        note?: string;
        timestamp?: Date;
        savingsAction?: SavingsAction;
        paymentMethod?: PaymentMethod;
        lendingAction?: LendingAction;
        borrowerId?: string;
      }
    ) => {
      setTransactions((prev) => {
        const next = prev.map((t) => {
          if (t.id !== id) return t;
          const isLending = input.category === LENDING_CATEGORY_KEY;
          const updated: Transaction = {
            ...t,
            amount: input.amount,
            category: input.category,
            note: input.note && input.note.trim().length > 0 ? input.note.trim() : undefined,
            savingsAction:
              input.category === SAVINGS_CATEGORY_KEY ? input.savingsAction ?? 'deposit' : undefined,
            paymentMethod: input.paymentMethod === 'credit' ? 'credit' : undefined,
            lendingAction: isLending ? input.lendingAction ?? 'lend' : undefined,
            borrowerId: isLending ? input.borrowerId : undefined,
          };
          if (input.timestamp) {
            updated.timestamp = input.timestamp.toISOString();
            updated.cycleIdentifier = clipRangeToTrackingStart(
              getCycleRangeForDate(input.timestamp, settings),
              trackingStartAsDate
            ).identifier;
          }
          return updated;
        });
        saveTransactions(next);
        return next;
      });
    },
    [settings, trackingStartAsDate]
  );

  // Auto-log any recurring entry that hasn't already produced a transaction for the
  // current cycle. Self-terminating: once applied, `transactions` includes the new
  // entries so the next effect run finds nothing missing and no-ops.
  useEffect(() => {
    if (loading || recurringEntries.length === 0) return;

    const existingSourceIds = new Set(
      transactions
        .filter((t) => t.cycleIdentifier === currentCycleRange.identifier && t.recurringSourceId)
        .map((t) => t.recurringSourceId)
    );

    const missing = recurringEntries.filter((r) => !existingSourceIds.has(r.id));
    if (missing.length === 0) return;

    const now = new Date();
    const newTxs: Transaction[] = missing.map((r) => ({
      id: generateId(),
      amount: r.amount,
      category: r.category,
      note: r.note,
      timestamp: now.toISOString(),
      cycleIdentifier: currentCycleRange.identifier,
      recurringSourceId: r.id,
    }));

    setTransactions((prev) => {
      const next = [...newTxs, ...prev];
      saveTransactions(next);
      return next;
    });
  }, [loading, recurringEntries, transactions, currentCycleRange.identifier]);

  const updateSettings = useCallback(
    async (next: CycleSettings) => {
      setSettings(next);
      await saveSettings(next);

      // Re-bucket existing data into the newly defined periods so a mode/date
      // change doesn't orphan transactions and paychecks under stale identifiers
      // computed from the old settings.
      setTransactions((prev) => {
        const updated = prev.map((t) => {
          const range = clipRangeToTrackingStart(
            getCycleRangeForDate(new Date(t.timestamp), next),
            trackingStartAsDate
          );
          return t.cycleIdentifier === range.identifier
            ? t
            : { ...t, cycleIdentifier: range.identifier };
        });
        saveTransactions(updated);
        return updated;
      });

      setPaychecks((prev) => {
        const updated: Record<string, number> = {};
        for (const [identifier, amount] of Object.entries(prev)) {
          const oldRange = parseCycleIdentifier(identifier);
          const newRange = clipRangeToTrackingStart(
            getCycleRangeForDate(oldRange.start, next),
            trackingStartAsDate
          );
          updated[newRange.identifier] = amount;
        }
        savePaychecks(updated);
        return updated;
      });
    },
    [trackingStartAsDate]
  );

  const setCurrentPaycheck = useCallback(
    async (amount: number | null) => {
      const identifier = currentCycleRange.identifier;
      setPaychecks((prev) => {
        const next = { ...prev };
        if (amount === null) {
          delete next[identifier];
        } else {
          next[identifier] = amount;
        }
        savePaychecks(next);
        return next;
      });
    },
    [currentCycleRange]
  );

  const addCategory = useCallback(
    async (input: { label: string; icon: string; color: string }) => {
      const label = input.label.trim();
      if (!label) return;
      const baseKey = slugify(label);
      const existingKeys = new Set(categories.map((c) => c.key));
      let key = baseKey;
      let suffix = 2;
      while (existingKeys.has(key)) {
        key = `${baseKey}-${suffix}`;
        suffix++;
      }
      const newCategory: CustomCategory = { key, label, icon: input.icon, color: input.color };
      setCustomCategories((prev) => {
        const next = [...prev, newCategory];
        saveCustomCategories(next);
        return next;
      });
    },
    [categories]
  );

  const removeCategory = useCallback(async (key: string) => {
    setCustomCategories((prev) => {
      const next = prev.filter((c) => c.key !== key);
      saveCustomCategories(next);
      return next;
    });
  }, []);

  const updateCategory = useCallback(
    async (key: string, input: { label: string; icon: string; color: string }) => {
      const label = input.label.trim();
      if (!label) return;
      setCustomCategories((prev) => {
        // The key stays fixed so existing transactions logged under it keep resolving correctly.
        const next = prev.map((c) =>
          c.key === key ? { ...c, label, icon: input.icon, color: input.color } : c
        );
        saveCustomCategories(next);
        return next;
      });
    },
    []
  );

  const addRecurringEntry = useCallback(
    async (input: { amount: number; category: CategoryKey; note?: string }) => {
      const entry: RecurringEntry = {
        id: generateId(),
        amount: input.amount,
        category: input.category,
        note: input.note && input.note.trim().length > 0 ? input.note.trim() : undefined,
      };
      setRecurringEntries((prev) => {
        const next = [...prev, entry];
        saveRecurringEntries(next);
        return next;
      });
    },
    []
  );

  const removeRecurringEntry = useCallback(async (id: string) => {
    setRecurringEntries((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveRecurringEntries(next);
      return next;
    });
  }, []);

  const addBorrower = useCallback((name: string): string => {
    const trimmed = name.trim();
    const borrower: Borrower = { id: generateId(), name: trimmed };
    setBorrowers((prev) => {
      const next = [...prev, borrower];
      saveBorrowers(next);
      return next;
    });
    return borrower.id;
  }, []);

  const removeBorrower = useCallback(async (id: string) => {
    setBorrowers((prev) => {
      const next = prev.filter((b) => b.id !== id);
      saveBorrowers(next);
      return next;
    });
  }, []);

  const setProfileName = useCallback(async (name: string) => {
    setProfileNameState(name);
    await saveProfileName(name);
  }, []);

  const setProfilePhotoUri = useCallback(async (uri: string | null) => {
    setProfilePhotoUriState(uri);
    if (uri) await saveProfilePhoto(uri);
  }, []);

  const exportBackup = useCallback(
    (): BackupData => ({
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions,
      settings,
      trackingStartDate,
      paychecks,
      customCategories,
      recurringEntries,
      profileName,
      profilePhotoUri,
      borrowers,
    }),
    [
      transactions,
      settings,
      trackingStartDate,
      paychecks,
      customCategories,
      recurringEntries,
      profileName,
      profilePhotoUri,
      borrowers,
    ]
  );

  const restoreFromBackup = useCallback(async (data: BackupData) => {
    const nextTransactions = data.transactions ?? [];
    const nextSettings = { ...DEFAULT_SETTINGS, ...data.settings };
    const nextPaychecks = data.paychecks ?? {};
    const nextCustomCategories = data.customCategories ?? [];
    const nextRecurringEntries = data.recurringEntries ?? [];
    const nextProfileName = data.profileName ?? '';
    const nextProfilePhotoUri = data.profilePhotoUri ?? null;
    const nextBorrowers = data.borrowers ?? [];

    await Promise.all([
      saveTransactions(nextTransactions),
      saveSettings(nextSettings),
      savePaychecks(nextPaychecks),
      saveCustomCategories(nextCustomCategories),
      saveRecurringEntries(nextRecurringEntries),
      saveProfileName(nextProfileName),
      nextProfilePhotoUri ? saveProfilePhoto(nextProfilePhotoUri) : Promise.resolve(),
      data.trackingStartDate ? saveTrackingStartDate(data.trackingStartDate) : Promise.resolve(),
      saveBorrowers(nextBorrowers),
    ]);

    setTransactions(nextTransactions);
    setSettings(nextSettings);
    setPaychecks(nextPaychecks);
    setCustomCategories(nextCustomCategories);
    setRecurringEntries(nextRecurringEntries);
    setProfileNameState(nextProfileName);
    setProfilePhotoUriState(nextProfilePhotoUri);
    if (data.trackingStartDate) setTrackingStartDate(data.trackingStartDate);
    setBorrowers(nextBorrowers);
  }, []);

  const totalSaved = useMemo(() => computeTotalSaved(transactions), [transactions]);
  const creditCardBalance = useMemo(() => computeCreditCardBalance(transactions), [transactions]);
  const totalLent = useMemo(() => computeTotalLent(transactions), [transactions]);
  const lentByBorrower = useMemo(() => computeLentByBorrower(transactions), [transactions]);

  const value: AppDataContextValue = {
    loading,
    transactions,
    settings,
    currentCycleRange,
    currentCycleIdentifier: currentCycleRange.identifier,
    currentPaycheck: paychecks[currentCycleRange.identifier] ?? null,
    totalSaved,
    creditCardBalance,
    totalLent,
    lentByBorrower,
    categories,
    categoryMap,
    recurringEntries,
    borrowers,
    profileName,
    profilePhotoUri,
    setProfileName,
    setProfilePhotoUri,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    updateSettings,
    setCurrentPaycheck,
    addCategory,
    updateCategory,
    removeCategory,
    addRecurringEntry,
    removeRecurringEntry,
    addBorrower,
    removeBorrower,
    exportBackup,
    restoreFromBackup,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
