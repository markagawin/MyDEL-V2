import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../AppDataContext';
import { formatPeso } from '../currency';
import { endOfDay, formatShortDate, formatTimeOfDay, startOfDay } from '../cycleEngine';
import { getAvailableCycles } from '../cycleList';
import { AppTheme, useTheme } from '../theme';
import DonutChart from '../components/DonutChart';
import CyclePickerModal from '../components/CyclePickerModal';
import CustomRangeBar from '../components/CustomRangeBar';
import ViewModeToggle, { ViewMode } from '../components/ViewModeToggle';
import CalendarSummaryModal from '../components/CalendarSummaryModal';
import SavingsSummaryModal from '../components/SavingsSummaryModal';
import LendingSummaryModal from '../components/LendingSummaryModal';
import { isSavingsTransaction } from '../savings';
import { isCreditCardPayment } from '../creditCard';
import { isLendingTransaction } from '../lending';
import { CategoryKey, Transaction } from '../types';

export default function SummaryScreen() {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    transactions,
    currentCycleIdentifier,
    currentCycleRange,
    categories,
    categoryMap,
    totalSaved,
    creditCardBalance,
    totalLent,
    borrowers,
  } = useAppData();
  const [selectedCycle, setSelectedCycle] = useState<string>(currentCycleIdentifier);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cycle');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [savingsVisible, setSavingsVisible] = useState(false);
  const [lendingVisible, setLendingVisible] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(currentCycleRange.start);
  const [customEnd, setCustomEnd] = useState<Date>(new Date());

  // If the user hasn't manually browsed to a past period, keep following "current"
  // as its identifier shifts (e.g. after a payday cycle settings change).
  const lastKnownCurrentRef = useRef(currentCycleIdentifier);
  useEffect(() => {
    if (
      selectedCycle === lastKnownCurrentRef.current &&
      currentCycleIdentifier !== lastKnownCurrentRef.current
    ) {
      setSelectedCycle(currentCycleIdentifier);
    }
    lastKnownCurrentRef.current = currentCycleIdentifier;
  }, [currentCycleIdentifier, selectedCycle]);

  const cycleOptions = useMemo(
    () => getAvailableCycles(transactions, currentCycleRange),
    [transactions, currentCycleRange]
  );
  const activeOption = cycleOptions.find((o) => o.identifier === selectedCycle) ?? cycleOptions[0];

  const inRange = useMemo(() => {
    if (viewMode === 'cycle') {
      return (t: Transaction) => t.cycleIdentifier === selectedCycle;
    }
    const from = startOfDay(customStart).getTime();
    const to = endOfDay(customEnd).getTime();
    return (t: Transaction) => {
      const time = new Date(t.timestamp).getTime();
      return time >= from && time <= to;
    };
  }, [viewMode, selectedCycle, customStart, customEnd]);

  const breakdown = useMemo(() => {
    const totals = new Map<CategoryKey, number>();
    for (const tx of transactions) {
      // Savings and lending are transfers, not spending. A credit card payment is excluded here
      // too — the purchase it settles is already counted under its real category (Food, Gas,
      // etc.) via its paymentMethod tag; counting the payment as well here would double it.
      if (
        !inRange(tx) ||
        isSavingsTransaction(tx) ||
        isCreditCardPayment(tx) ||
        isLendingTransaction(tx)
      )
        continue;
      totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount);
    }
    const total = Array.from(totals.values()).reduce((s, v) => s + v, 0);
    const rows = categories
      .map((meta) => ({
        meta,
        amount: totals.get(meta.key) ?? 0,
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { rows, total };
  }, [transactions, inRange, categories]);

  const entriesByCategory = useMemo(() => {
    const map = new Map<CategoryKey, Transaction[]>();
    for (const tx of transactions) {
      if (!inRange(tx)) continue;
      if (!map.has(tx.category)) map.set(tx.category, []);
      map.get(tx.category)!.push(tx);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    return map;
  }, [transactions, inRange]);

  const highest = breakdown.rows[0];
  const selected = selectedCategory
    ? breakdown.rows.find((r) => r.meta.key === selectedCategory)
    : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Summary</Text>
          <View style={styles.headerButtonRow}>
            <TouchableOpacity
              accessibilityLabel="Calendar view"
              style={styles.calendarButton}
              onPress={() => setCalendarVisible(true)}
            >
              <View style={styles.calendarIcon}>
                <View style={styles.calendarIconHeader} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Settings"
              style={styles.calendarButton}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.gearIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ViewModeToggle
          mode={viewMode}
          onChange={(m) => {
            setViewMode(m);
            setSelectedCategory(null);
          }}
        />
        {viewMode === 'cycle' ? (
          <TouchableOpacity style={styles.filterButton} onPress={() => setPickerVisible(true)}>
            <Text style={styles.filterText}>{activeOption?.label ?? 'Select period'}</Text>
            <Text style={styles.filterChevron}>▾</Text>
          </TouchableOpacity>
        ) : (
          <CustomRangeBar
            start={customStart}
            end={customEnd}
            onChange={(s, e) => {
              setCustomStart(s);
              setCustomEnd(e);
              setSelectedCategory(null);
            }}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TouchableOpacity style={styles.savingsCard} onPress={() => setSavingsVisible(true)}>
          <View>
            <Text style={styles.savingsLabel}>💰 Total Saved</Text>
            <Text style={styles.savingsHint}>Deposits and withdrawals, all time</Text>
          </View>
          <Text style={styles.savingsValue}>{formatPeso(totalSaved)}</Text>
        </TouchableOpacity>

        <View style={styles.savingsCard}>
          <View>
            <Text style={styles.savingsLabel}>💳 Credit Card Owed</Text>
            <Text style={styles.savingsHint}>Purchases minus payments, all time</Text>
          </View>
          <Text style={styles.savingsValue}>{formatPeso(creditCardBalance)}</Text>
        </View>

        <TouchableOpacity style={styles.savingsCard} onPress={() => setLendingVisible(true)}>
          <View>
            <Text style={styles.savingsLabel}>🤝 Money Lent Out</Text>
            <Text style={styles.savingsHint}>Across everyone, all time</Text>
          </View>
          <Text style={styles.savingsValue}>{formatPeso(totalLent)}</Text>
        </TouchableOpacity>

        {highest ? (
          <View style={styles.highlightCard}>
            <Text style={styles.highlightLabel}>Highest Spend</Text>
            <Text style={styles.highlightValue}>
              {highest.meta.icon} {highest.meta.label} — {formatPeso(highest.amount)} (
              {Math.round((highest.amount / breakdown.total) * 100)}%)
            </Text>
          </View>
        ) : (
          <View style={styles.highlightCard}>
            <Text style={styles.highlightLabel}>No spending logged yet</Text>
          </View>
        )}

        <View style={styles.chartWrap}>
          <DonutChart
            slices={breakdown.rows.map((r) => ({
              key: r.meta.key,
              color: r.meta.color,
              value: r.amount,
            }))}
            selectedKey={selectedCategory}
            onSelectKey={(key) => setSelectedCategory(key as CategoryKey | null)}
          />
          <View style={styles.chartCenter} pointerEvents="none">
            {selected ? (
              <>
                <Text style={styles.chartCenterIcon}>{selected.meta.icon}</Text>
                <Text style={styles.chartCenterAmount}>{formatPeso(selected.amount)}</Text>
                <Text style={styles.chartCenterSub}>
                  {Math.round((selected.amount / breakdown.total) * 100)}% of total
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.chartCenterSub}>Total Outflow</Text>
                <Text style={styles.chartCenterAmount}>{formatPeso(breakdown.total)}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.list}>
          {breakdown.rows.map((row) => {
            const pct = breakdown.total > 0 ? (row.amount / breakdown.total) * 100 : 0;
            const isSelected = selectedCategory === row.meta.key;
            const entries = entriesByCategory.get(row.meta.key) ?? [];
            return (
              <TouchableOpacity
                key={row.meta.key}
                style={[styles.listRow, isSelected && styles.listRowSelected]}
                onPress={() =>
                  setSelectedCategory(isSelected ? null : (row.meta.key as CategoryKey))
                }
              >
                <View style={styles.listRowTop}>
                  <View style={styles.listRowLeft}>
                    <Text style={styles.listIcon}>{row.meta.icon}</Text>
                    <View>
                      <Text style={styles.listLabel}>{row.meta.label}</Text>
                      <Text style={styles.listCount}>
                        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.listRowRight}>
                    <Text style={styles.listAmount}>{formatPeso(row.amount)}</Text>
                    <Text style={styles.listChevron}>{isSelected ? '▾' : '▸'}</Text>
                  </View>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${pct}%`, backgroundColor: row.meta.color },
                    ]}
                  />
                </View>
                <Text style={styles.listPct}>{pct.toFixed(1)}%</Text>

                {isSelected && (
                  <View style={styles.entryList}>
                    {entries.map((tx) => (
                      <View key={tx.id} style={styles.entryRow}>
                        <View style={styles.entryTimeCol}>
                          <Text style={styles.entryDate}>
                            {formatShortDate(new Date(tx.timestamp))}
                          </Text>
                          <Text style={styles.entryTime}>
                            {formatTimeOfDay(new Date(tx.timestamp))}
                          </Text>
                        </View>
                        <Text style={styles.entryNote} numberOfLines={1}>
                          {tx.note ?? '—'}
                        </Text>
                        <Text style={styles.entryAmount}>{formatPeso(tx.amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          {breakdown.rows.length === 0 && (
            <Text style={styles.emptyText}>Nothing to show for this period yet.</Text>
          )}
        </View>
      </ScrollView>

      <CyclePickerModal
        visible={pickerVisible}
        options={cycleOptions}
        selectedIdentifier={selectedCycle}
        onSelect={(id) => {
          setSelectedCycle(id);
          setSelectedCategory(null);
        }}
        onClose={() => setPickerVisible(false)}
      />

      <CalendarSummaryModal
        visible={calendarVisible}
        transactions={transactions}
        categoryMap={categoryMap}
        currentCycleRange={currentCycleRange}
        onClose={() => setCalendarVisible(false)}
      />

      <SavingsSummaryModal
        visible={savingsVisible}
        transactions={transactions}
        onClose={() => setSavingsVisible(false)}
      />

      <LendingSummaryModal
        visible={lendingVisible}
        transactions={transactions}
        borrowers={borrowers}
        onClose={() => setLendingVisible(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.navy },
  headerButtonRow: { flexDirection: 'row', gap: 10 },
  gearIcon: { fontSize: 18 },
  calendarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  calendarIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.navy,
    overflow: 'hidden',
  },
  calendarIconHeader: { height: 6, backgroundColor: theme.navy },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterText: { fontSize: 13, fontWeight: '600', color: theme.text, marginRight: 6 },
  filterChevron: { fontSize: 12, color: theme.textMuted },
  savingsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  savingsLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
  savingsHint: { fontSize: 11.5, color: theme.textMuted, marginTop: 2 },
  savingsValue: { fontSize: 18, fontWeight: '800', color: theme.navy },
  highlightCard: {
    backgroundColor: theme.navy,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  highlightLabel: { color: '#9FB2D6', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  highlightValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  chartWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  chartCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCenterIcon: { fontSize: 20 },
  chartCenterAmount: { fontSize: 18, fontWeight: '800', color: theme.text, marginTop: 2 },
  chartCenterSub: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  list: { gap: 10 },
  listRow: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 10,
  },
  listRowSelected: { borderColor: theme.navy },
  listRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listRowLeft: { flexDirection: 'row', alignItems: 'center' },
  listRowRight: { alignItems: 'flex-end' },
  listIcon: { fontSize: 18, marginRight: 8 },
  listLabel: { fontSize: 14.5, fontWeight: '700', color: theme.text },
  listCount: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  listAmount: { fontSize: 14.5, fontWeight: '700', color: theme.text },
  listChevron: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.background,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  listPct: { fontSize: 11, color: theme.textMuted, marginTop: 4, textAlign: 'right' },
  entryList: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 6,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryTimeCol: { width: 60, marginRight: 4 },
  entryDate: { fontSize: 10.5, fontWeight: '600', color: theme.textMuted },
  entryTime: { fontSize: 10.5, color: theme.textMuted, marginTop: 1 },
  entryNote: { fontSize: 12.5, color: theme.text, flex: 1, marginRight: 8 },
  entryAmount: { fontSize: 12.5, fontWeight: '700', color: theme.text },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 20 },
});
