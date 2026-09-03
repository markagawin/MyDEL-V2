import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../AppDataContext';
import { CategoryKey, LendingAction, SavingsAction } from '../types';
import { formatPeso } from '../currency';
import { formatFullDate, sameDay } from '../cycleEngine';
import { SAVINGS_CATEGORY_KEY, isSavingsTransaction, savingsSignedAmount } from '../savings';
import { CREDIT_CARD_CATEGORY_KEY, isCreditPurchase } from '../creditCard';
import { LENDING_CATEGORY_KEY, isLendingTransaction, lendingSignedAmount } from '../lending';
import { loadBannerViewState, saveBannerViewState } from '../storage';
import { AppTheme, useTheme } from '../theme';
import PaycheckModal from '../components/PaycheckModal';
import AddCategoryModal from '../components/AddCategoryModal';
import AddBorrowerModal from '../components/AddBorrowerModal';
import DatePickerModal from '../components/DatePickerModal';
import Toast from '../components/Toast';
import { noWebOutline, webPanYOnly } from '../webInputStyle';

export default function QuickLogScreen() {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    transactions,
    currentCycleIdentifier,
    currentCycleRange,
    currentPaycheck,
    categories,
    addTransaction,
    deleteTransaction,
    setCurrentPaycheck,
    addCategory,
    borrowers,
    addBorrower,
    profileName,
    profilePhotoUri,
  } = useAppData();
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [savingsAction, setSavingsAction] = useState<SavingsAction>('deposit');
  const [lendingAction, setLendingAction] = useState<LendingAction>('lend');
  const [borrowerId, setBorrowerId] = useState<string | null>(null);
  const [addBorrowerModalVisible, setAddBorrowerModalVisible] = useState(false);
  // True once the Credit Card tile has been tapped from the top-level grid — swaps the grid to
  // "what was this for" (real categories + a Pay Credit Card option) so a credit purchase is
  // always explicitly tied to a real category, never left as a bare "Credit Card" entry.
  const [creditGateActive, setCreditGateActive] = useState(false);
  const [note, setNote] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date());
  const [paycheckModalVisible, setPaycheckModalVisible] = useState(false);
  const [addCategoryModalVisible, setAddCategoryModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  // 0 = Remaining of paycheck, 1 = Total spent this period, 2 = Total spent today.
  const [bannerView, setBannerView] = useState<0 | 1 | 2>(0);
  const [bannerWidth, setBannerWidthState] = useState(0);
  const [amountBlurred, setAmountBlurred] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastUndoId, setToastUndoId] = useState<string | null>(null);
  const amountInputRef = useRef<TextInput>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setBannerView(0);
  }, [currentCycleIdentifier]);

  // Restore whichever banner page was showing last time, but only within the same cycle —
  // a new cycle should still start back on "Remaining of paycheck". Runs once on mount;
  // deliberately not re-run when currentCycleIdentifier changes later, since the reset
  // effect above already handles that case.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadBannerViewState();
      if (
        !cancelled &&
        saved &&
        saved.cycleIdentifier === currentCycleIdentifier &&
        (saved.view === 0 || saved.view === 1 || saved.view === 2)
      ) {
        setBannerView(saved.view as 0 | 1 | 2);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveBannerViewState({ cycleIdentifier: currentCycleIdentifier, view: bannerView });
  }, [bannerView, currentCycleIdentifier]);

  const bannerWidthRef = useRef(0);
  const setBannerWidth = (width: number) => {
    bannerWidthRef.current = width;
    setBannerWidthState(width);
  };
  const bannerTranslateX = useRef(new Animated.Value(0)).current;
  const hasPositionedBannerRef = useRef(false);

  // Slide smoothly to whichever page bannerView points at — for dot taps, swipe releases
  // that land on a different page, and cycle resets. The very first positioning (on mount,
  // once the banner's width is known) jumps instantly instead of animating in from page 0.
  useEffect(() => {
    if (bannerWidth === 0) return;
    const toValue = -bannerView * bannerWidth;
    if (!hasPositionedBannerRef.current) {
      hasPositionedBannerRef.current = true;
      bannerTranslateX.setValue(toValue);
      return;
    }
    Animated.timing(bannerTranslateX, {
      toValue,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [bannerView, bannerWidth]);

  const settleBannerTo = (target: 0 | 1 | 2) => {
    Animated.timing(bannerTranslateX, {
      toValue: -target * bannerWidthRef.current,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const bannerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 5,
        // Once we've decided this is a horizontal swipe, don't let the surrounding
        // ScrollView take it back mid-drag just because of a little vertical wobble.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          bannerTranslateX.stopAnimation();
          bannerTranslateX.setOffset(-bannerView * bannerWidthRef.current);
          bannerTranslateX.setValue(0);
        },
        onPanResponderMove: Animated.event([null, { dx: bannerTranslateX }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gesture) => {
          bannerTranslateX.flattenOffset();
          const width = bannerWidthRef.current || 1;
          // Either a deliberate drag past ~12% of the banner's width, or a quick flick
          // (high velocity) even over a short distance — matches how native swipers/
          // page-dots behave, so a fast short flick isn't ignored just because it
          // didn't travel far.
          const passedDistance = Math.abs(gesture.dx) > width * 0.12;
          const passedVelocity = Math.abs(gesture.vx) > 0.3;
          let target: 0 | 1 | 2 = bannerView;
          if (passedDistance || passedVelocity) {
            const direction = passedVelocity ? gesture.vx : gesture.dx;
            target = Math.max(0, Math.min(2, bannerView + (direction < 0 ? 1 : -1))) as 0 | 1 | 2;
          }
          settleBannerTo(target);
          if (target !== bannerView) setBannerView(target);
        },
        onPanResponderTerminate: () => {
          bannerTranslateX.flattenOffset();
          settleBannerTo(bannerView);
        },
      }),
    [bannerView]
  );

  const cycleLabel = currentCycleRange.label;

  // Net outflow for the current period: a savings deposit, or lending money out, counts like an
  // expense (money no longer available), while a withdrawal or a repayment gives money back, so
  // it's subtracted rather than added. A credit card purchase doesn't touch this at all — no
  // cash has actually left yet, only the eventual "Pay Credit Card" entry does. This is what
  // "Remaining of paycheck" and the progress bar are based on.
  const periodTotal = useMemo(() => {
    return transactions
      .filter((t) => t.cycleIdentifier === currentCycleIdentifier && !isCreditPurchase(t))
      .reduce((sum, t) => {
        if (isSavingsTransaction(t)) return sum + savingsSignedAmount(t);
        if (isLendingTransaction(t)) return sum + lendingSignedAmount(t);
        return sum + t.amount;
      }, 0);
  }, [transactions, currentCycleIdentifier]);

  // "Total spent so far" excludes savings and lending (moving money, not spending it) and
  // credit purchases (no cash gone yet) — but a "Pay Credit Card" entry counts normally, since
  // that's the moment real cash actually leaves.
  const periodSpentTotal = useMemo(() => {
    return transactions
      .filter(
        (t) =>
          t.cycleIdentifier === currentCycleIdentifier &&
          !isSavingsTransaction(t) &&
          !isCreditPurchase(t) &&
          !isLendingTransaction(t)
      )
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, currentCycleIdentifier]);

  // Live total for just today, regardless of which cycle it falls in — same exclusions.
  const todaySpentTotal = useMemo(() => {
    const now = new Date();
    return transactions
      .filter(
        (t) =>
          !isSavingsTransaction(t) &&
          !isCreditPurchase(t) &&
          !isLendingTransaction(t) &&
          sameDay(new Date(t.timestamp), now)
      )
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  // Once the Credit Card gate is active, the grid swaps to "what was this for": real categories
  // only (Savings and the Credit Card tile itself don't make sense as a credit purchase), plus a
  // relabeled Credit Card tile that now means "log this as a card payment instead".
  const visibleCategories = useMemo(() => {
    if (!creditGateActive) return categories;
    const creditCardMeta = categories.find((c) => c.key === CREDIT_CARD_CATEGORY_KEY);
    const realCategories = categories.filter(
      (c) => c.key !== SAVINGS_CATEGORY_KEY && c.key !== CREDIT_CARD_CATEGORY_KEY
    );
    return creditCardMeta
      ? [...realCategories, { ...creditCardMeta, label: 'Pay Credit Card' }]
      : realCategories;
  }, [categories, creditGateActive]);

  // The grid is 4 tiles per row with justifyContent: 'space-between', which spaces a
  // *partial* last row differently depending on how many tiles are in it (1 tile sits at the
  // left, 3 tiles spread edge-to-edge, etc.) — so the layout visibly jumps whenever the tile
  // count changes, e.g. entering/leaving the credit card gate. Padding the count up to a
  // multiple of 4 with invisible filler tiles gives space-between a full row to distribute
  // every time, which keeps the real tiles consistently left-anchored regardless of count.
  const gridFillerCount = useMemo(() => {
    const totalTiles = visibleCategories.length + (creditGateActive ? 0 : 1); // +1 for Add tile
    return (4 - (totalTiles % 4)) % 4;
  }, [visibleCategories.length, creditGateActive]);

  const remaining = currentPaycheck !== null ? currentPaycheck - periodTotal : null;
  const pctSpent =
    currentPaycheck !== null && currentPaycheck > 0 ? (periodTotal / currentPaycheck) * 100 : 0;

  const amountValue = parseFloat(amountText);
  const hasValidAmount = !Number.isNaN(amountValue) && amountValue > 0;
  const isLendingCategorySelected = category === LENDING_CATEGORY_KEY;
  const canLog =
    hasValidAmount && category !== null && (!isLendingCategorySelected || borrowerId !== null);
  const showCategoryPrompt = amountBlurred && hasValidAmount && category === null;

  const handleLog = () => {
    if (!canLog || category === null) return;
    const loggedAmount = amountValue;
    const loggedCategory = category;
    const loggedNote = note;
    const loggedSavingsAction = savingsAction;
    const loggedLendingAction = lendingAction;
    const loggedBorrowerId = borrowerId;
    const isSavings = loggedCategory === SAVINGS_CATEGORY_KEY;
    const isLending = loggedCategory === LENDING_CATEGORY_KEY;
    const isCreditCardPaymentEntry = loggedCategory === CREDIT_CARD_CATEGORY_KEY;
    // Reached the credit gate and picked a real category: this is a purchase charged to the
    // card. Picking "Pay Credit Card" itself (loggedCategory === CREDIT_CARD_CATEGORY_KEY) is a
    // payment instead, not a purchase, so it isn't tagged as one.
    const isCreditPurchaseEntry = creditGateActive && !isCreditCardPaymentEntry;
    const borrowerName = borrowers.find((b) => b.id === loggedBorrowerId)?.name ?? 'them';

    const now = new Date();
    const timestamp = new Date(
      entryDate.getFullYear(),
      entryDate.getMonth(),
      entryDate.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );

    setAmountText('');
    setNote('');
    setAmountBlurred(false);
    setEntryDate(new Date());
    setSavingsAction('deposit');
    setCreditGateActive(false);
    setLendingAction('lend');
    setBorrowerId(null);
    amountInputRef.current?.blur();

    const newId = addTransaction({
      amount: loggedAmount,
      category: loggedCategory,
      note: loggedNote,
      timestamp,
      savingsAction: isSavings ? loggedSavingsAction : undefined,
      paymentMethod: isCreditPurchaseEntry ? 'credit' : undefined,
      lendingAction: isLending ? loggedLendingAction : undefined,
      borrowerId: isLending ? loggedBorrowerId ?? undefined : undefined,
    });

    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(
      isSavings
        ? loggedSavingsAction === 'withdrawal'
          ? `${formatPeso(loggedAmount)} withdrawn from savings`
          : `${formatPeso(loggedAmount)} deposited to savings`
        : isLending
          ? loggedLendingAction === 'repaid'
            ? `${formatPeso(loggedAmount)} repaid by ${borrowerName}`
            : `${formatPeso(loggedAmount)} lent to ${borrowerName}`
          : isCreditCardPaymentEntry
            ? `${formatPeso(loggedAmount)} paid toward credit card`
            : isCreditPurchaseEntry
              ? `${formatPeso(loggedAmount)} charged to credit card`
              : `${formatPeso(loggedAmount)} added successfully`
    );
    setToastUndoId(newId);
    setToastVisible(true);
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
      setToastUndoId(null);
    }, 2200);
  };

  const handleUndo = () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (toastUndoId) deleteTransaction(toastUndoId);
    setToastVisible(false);
    setToastUndoId(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.appName}>MyDEL</Text>
              <Text style={styles.appSubtitle}>My Daily Expenses in Life</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Settings"
              style={styles.profileCluster}
              onPress={() => navigation.navigate('Settings')}
            >
              {profileName ? (
                <Text style={styles.profileName} numberOfLines={1}>
                  {profileName}
                </Text>
              ) : null}
              <View style={styles.avatarWrap}>
                {profilePhotoUri ? (
                  <Image source={{ uri: profilePhotoUri }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {profileName.trim() ? profileName.trim().charAt(0).toUpperCase() : '🙂'}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.banner}>
            <View style={styles.bannerTopRow}>
              <Text style={styles.bannerLabel}>Current Period: {cycleLabel}</Text>
              <TouchableOpacity onPress={() => setPaycheckModalVisible(true)}>
                <Text style={styles.paycheckLink}>
                  {currentPaycheck !== null ? 'Edit Paycheck' : '+ Add Paycheck'}
                </Text>
              </TouchableOpacity>
            </View>

            {currentPaycheck !== null && remaining !== null ? (
              <>
                <View
                  style={[styles.bannerCarouselClip, webPanYOnly]}
                  onLayout={(e) => setBannerWidth(e.nativeEvent.layout.width)}
                  {...bannerPanResponder.panHandlers}
                >
                  <Animated.View
                    style={[
                      styles.bannerCarouselTrack,
                      { width: bannerWidth * 3, transform: [{ translateX: bannerTranslateX }] },
                    ]}
                  >
                    <View style={{ width: bannerWidth }}>
                      <Text
                        style={[styles.bannerTotal, remaining < 0 && styles.bannerTotalDanger]}
                      >
                        {formatPeso(remaining)}
                      </Text>
                      <Text style={styles.bannerSub}>
                        {remaining >= 0
                          ? `Remaining of ${formatPeso(currentPaycheck)} paycheck`
                          : `${formatPeso(Math.abs(remaining))} over your ${formatPeso(
                              currentPaycheck
                            )} paycheck`}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.min(100, pctSpent)}%` },
                            pctSpent > 100 && styles.progressFillDanger,
                          ]}
                        />
                      </View>
                    </View>

                    <View style={{ width: bannerWidth }}>
                      <Text style={styles.bannerTotal}>{formatPeso(periodSpentTotal)}</Text>
                      <Text style={styles.bannerSub}>Total spent so far</Text>
                    </View>

                    <View style={{ width: bannerWidth }}>
                      <Text style={styles.bannerTotal}>{formatPeso(todaySpentTotal)}</Text>
                      <Text style={styles.bannerSub}>Total spent today</Text>
                    </View>
                  </Animated.View>
                </View>

                <View style={styles.bannerDots}>
                  <TouchableOpacity onPress={() => setBannerView(0)}>
                    <View style={[styles.bannerDot, bannerView === 0 && styles.bannerDotActive]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setBannerView(1)}>
                    <View style={[styles.bannerDot, bannerView === 1 && styles.bannerDotActive]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setBannerView(2)}>
                    <View style={[styles.bannerDot, bannerView === 2 && styles.bannerDotActive]} />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.bannerTotal}>{formatPeso(periodSpentTotal)}</Text>
                <Text style={styles.bannerSub}>Total spent so far</Text>
              </>
            )}
          </View>

          <Text style={styles.fieldLabel}>AMOUNT</Text>
          <View style={styles.amountWrap}>
            <Text style={styles.pesoSign}>₱</Text>
            <TextInput
              ref={amountInputRef}
              style={[styles.amountInput, noWebOutline]}
              value={amountText}
              onChangeText={(v) => setAmountText(v.replace(/[^0-9.]/g, ''))}
              onFocus={() => setAmountBlurred(false)}
              onBlur={() => setAmountBlurred(true)}
              placeholder="0.00"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>

          {showCategoryPrompt && (
            <Text style={styles.categoryPrompt}>👇 Pick a category for this amount</Text>
          )}

          {creditGateActive && (
            <View style={styles.creditGateBanner}>
              <Text style={styles.creditGateBannerText}>💳 Using credit card</Text>
              <TouchableOpacity
                onPress={() => {
                  setCreditGateActive(false);
                  setCategory(null);
                }}
              >
                <Text style={styles.creditGateBannerCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.grid}>
            {visibleCategories.map((cat) => {
              const selected = category === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => {
                    if (cat.key === CREDIT_CARD_CATEGORY_KEY && !creditGateActive) {
                      setCreditGateActive(true);
                      setCategory(null);
                      return;
                    }
                    setCategory(selected ? null : cat.key);
                    setSavingsAction('deposit');
                    setLendingAction('lend');
                    setBorrowerId(null);
                  }}
                  style={[
                    styles.tile,
                    selected && { backgroundColor: cat.color, borderColor: cat.color },
                  ]}
                >
                  <Text style={styles.tileIcon}>{cat.icon}</Text>
                  <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
            {!creditGateActive && (
              <Pressable
                style={[styles.tile, styles.addTile]}
                onPress={() => setAddCategoryModalVisible(true)}
              >
                <Text style={styles.addTileIcon}>+</Text>
                <Text style={styles.addTileLabel}>Add</Text>
              </Pressable>
            )}
            {Array.from({ length: gridFillerCount }).map((_, i) => (
              <View key={`filler-${i}`} style={[styles.tile, styles.tileFiller]} />
            ))}
          </View>

          {category === SAVINGS_CATEGORY_KEY && (
            <View style={styles.savingsToggleRow}>
              <TouchableOpacity
                style={[
                  styles.savingsToggleOption,
                  savingsAction === 'deposit' && styles.savingsToggleOptionActive,
                ]}
                onPress={() => setSavingsAction('deposit')}
              >
                <Text
                  style={[
                    styles.savingsToggleText,
                    savingsAction === 'deposit' && styles.savingsToggleTextActive,
                  ]}
                >
                  Deposit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.savingsToggleOption,
                  savingsAction === 'withdrawal' && styles.savingsToggleOptionActive,
                ]}
                onPress={() => setSavingsAction('withdrawal')}
              >
                <Text
                  style={[
                    styles.savingsToggleText,
                    savingsAction === 'withdrawal' && styles.savingsToggleTextActive,
                  ]}
                >
                  Withdrawal
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isLendingCategorySelected && (
            <>
              <View style={styles.savingsToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.savingsToggleOption,
                    lendingAction === 'lend' && styles.savingsToggleOptionActive,
                  ]}
                  onPress={() => setLendingAction('lend')}
                >
                  <Text
                    style={[
                      styles.savingsToggleText,
                      lendingAction === 'lend' && styles.savingsToggleTextActive,
                    ]}
                  >
                    Lend
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.savingsToggleOption,
                    lendingAction === 'repaid' && styles.savingsToggleOptionActive,
                  ]}
                  onPress={() => setLendingAction('repaid')}
                >
                  <Text
                    style={[
                      styles.savingsToggleText,
                      lendingAction === 'repaid' && styles.savingsToggleTextActive,
                    ]}
                  >
                    Repaid
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabelMuted}>PERSON</Text>
              <View style={styles.borrowerRow}>
                {borrowers.map((b) => {
                  const selected = borrowerId === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.borrowerChip, selected && styles.borrowerChipSelected]}
                      onPress={() => setBorrowerId(b.id)}
                    >
                      <Text
                        style={[
                          styles.borrowerChipText,
                          selected && styles.borrowerChipTextSelected,
                        ]}
                      >
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.borrowerChip, styles.addBorrowerChip]}
                  onPress={() => setAddBorrowerModalVisible(true)}
                >
                  <Text style={styles.addBorrowerChipText}>+ Add Person</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={styles.fieldLabelMuted}>NOTE (OPTIONAL)</Text>
          <View style={styles.noteWrap}>
            <Text style={styles.noteIcon}>📝</Text>
            <TextInput
              style={[styles.noteInput, noWebOutline]}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Lunch with team"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <Text style={styles.fieldLabelMuted}>DATE</Text>
          <TouchableOpacity style={styles.dateWrap} onPress={() => setDatePickerVisible(true)}>
            <Text style={styles.dateIcon}>📅</Text>
            <Text style={styles.dateText}>
              {formatFullDate(entryDate)}
              {sameDay(entryDate, new Date()) ? ' (Today)' : ''}
            </Text>
          </TouchableOpacity>

        </ScrollView>

        <View style={styles.floatingFooter}>
          <TouchableOpacity
            style={[styles.logButton, !canLog && styles.logButtonDisabled]}
            disabled={!canLog}
            onPress={handleLog}
          >
            <Text style={styles.logButtonText}>Log Entry</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <PaycheckModal
        visible={paycheckModalVisible}
        currentAmount={currentPaycheck}
        onSave={setCurrentPaycheck}
        onClose={() => setPaycheckModalVisible(false)}
      />

      <AddCategoryModal
        visible={addCategoryModalVisible}
        categoryCount={categories.length}
        onSave={addCategory}
        onClose={() => setAddCategoryModalVisible(false)}
      />

      <AddBorrowerModal
        visible={addBorrowerModalVisible}
        onSave={(name) => setBorrowerId(addBorrower(name))}
        onClose={() => setAddBorrowerModalVisible(false)}
      />

      <DatePickerModal
        visible={datePickerVisible}
        value={entryDate}
        maxDate={new Date()}
        onChange={setEntryDate}
        onClose={() => setDatePickerVisible(false)}
      />

      <Toast visible={toastVisible} message={toastMessage} onUndo={handleUndo} />
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  scrollContent: { padding: 20, paddingBottom: 24 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  appName: { fontSize: 26, fontWeight: '800', color: theme.navy },
  appSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  profileCluster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { fontSize: 12.5, fontWeight: '600', color: theme.textMuted, maxWidth: 70 },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  avatarInitial: { fontSize: 15, fontWeight: '700', color: theme.navy },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.navy,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldLabelMuted: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  banner: {
    backgroundColor: theme.navy,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  bannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerLabel: { color: '#C9D6EE', fontSize: 13, fontWeight: '600' },
  paycheckLink: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  bannerCarouselClip: { overflow: 'hidden', width: '100%' },
  bannerCarouselTrack: { flexDirection: 'row' },
  bannerTotal: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 6 },
  bannerTotalDanger: { color: '#FF9B9B' },
  bannerSub: { color: '#9FB2D6', fontSize: 12, marginTop: 2 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#5FE3A1',
  },
  progressFillDanger: { backgroundColor: '#FF6B6B' },
  bannerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  bannerDotActive: { backgroundColor: '#FFFFFF' },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  pesoSign: { fontSize: 26, fontWeight: '700', color: theme.navy, marginRight: 6 },
  amountInput: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.text,
    minWidth: 120,
    textAlign: 'left',
  },
  categoryPrompt: {
    fontSize: 12.5,
    fontWeight: '600',
    color: theme.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
  creditGateBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  creditGateBannerText: { fontSize: 13, fontWeight: '700', color: theme.text },
  creditGateBannerCancel: { fontSize: 12.5, fontWeight: '700', color: theme.danger },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tile: {
    width: '23.5%',
    aspectRatio: 1,
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  tileIcon: { fontSize: 24, marginBottom: 4 },
  tileLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: theme.text,
    textAlign: 'center',
  },
  tileLabelSelected: { color: '#FFFFFF' },
  addTile: {
    borderStyle: 'dashed',
    backgroundColor: theme.background,
  },
  addTileIcon: { fontSize: 22, fontWeight: '700', color: theme.textMuted, marginBottom: 2 },
  addTileLabel: { fontSize: 10.5, fontWeight: '600', color: theme.textMuted },
  tileFiller: { backgroundColor: 'transparent', borderColor: 'transparent' },
  savingsToggleRow: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  savingsToggleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  savingsToggleOptionActive: { backgroundColor: theme.navy },
  savingsToggleText: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
  savingsToggleTextActive: { color: '#FFFFFF' },
  borrowerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  borrowerChip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  borrowerChipSelected: { backgroundColor: theme.navy, borderColor: theme.navy },
  borrowerChipText: { fontSize: 13, fontWeight: '600', color: theme.text },
  borrowerChipTextSelected: { color: '#FFFFFF' },
  addBorrowerChip: { borderStyle: 'dashed', backgroundColor: theme.background },
  addBorrowerChipText: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
  noteWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 20,
  },
  noteIcon: { fontSize: 15, marginRight: 8 },
  noteInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.text,
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  dateIcon: { fontSize: 15, marginRight: 8 },
  dateText: { fontSize: 14, fontWeight: '600', color: theme.text },
  floatingFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  logButton: {
    backgroundColor: theme.navy,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logButtonDisabled: { backgroundColor: theme.disabled },
  logButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
