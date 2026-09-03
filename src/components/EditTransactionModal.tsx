import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CategoryMeta } from '../categories';
import { Borrower, CategoryKey, LendingAction, PaymentMethod, SavingsAction, Transaction } from '../types';
import { formatFullDate, sameDay } from '../cycleEngine';
import { SAVINGS_CATEGORY_KEY } from '../savings';
import { CREDIT_CARD_CATEGORY_KEY } from '../creditCard';
import { LENDING_CATEGORY_KEY } from '../lending';
import { AppTheme, useTheme } from '../theme';
import { noWebOutline } from '../webInputStyle';
import DatePickerModal from './DatePickerModal';
import AddBorrowerModal from './AddBorrowerModal';

interface Props {
  transaction: Transaction | null;
  categories: CategoryMeta[];
  borrowers: Borrower[];
  onAddBorrower: (name: string) => string;
  onSave: (
    id: string,
    input: {
      amount: number;
      category: CategoryKey;
      note?: string;
      timestamp: Date;
      savingsAction?: SavingsAction;
      paymentMethod?: PaymentMethod;
      lendingAction?: LendingAction;
      borrowerId?: string;
    }
  ) => void;
  onClose: () => void;
}

export default function EditTransactionModal({
  transaction,
  categories,
  borrowers,
  onAddBorrower,
  onSave,
  onClose,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [savingsAction, setSavingsAction] = useState<SavingsAction>('deposit');
  const [lendingAction, setLendingAction] = useState<LendingAction>('lend');
  const [borrowerId, setBorrowerId] = useState<string | null>(null);
  const [addBorrowerModalVisible, setAddBorrowerModalVisible] = useState(false);
  const [creditGateActive, setCreditGateActive] = useState(false);
  const [note, setNote] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  useEffect(() => {
    if (transaction) {
      setAmountText(String(transaction.amount));
      setCategory(transaction.category);
      setSavingsAction(transaction.savingsAction ?? 'deposit');
      setLendingAction(transaction.lendingAction ?? 'lend');
      setBorrowerId(transaction.borrowerId ?? null);
      setCreditGateActive(
        transaction.paymentMethod === 'credit' || transaction.category === CREDIT_CARD_CATEGORY_KEY
      );
      setNote(transaction.note ?? '');
      setEntryDate(new Date(transaction.timestamp));
    }
  }, [transaction]);

  const isLendingCategorySelected = category === LENDING_CATEGORY_KEY;

  const visibleCategories = useMemo(() => {
    if (!creditGateActive) return categories;
    const creditCardMeta = categories.find((c) => c.key === CREDIT_CARD_CATEGORY_KEY);
    const realCategories = categories.filter(
      (c) =>
        c.key !== SAVINGS_CATEGORY_KEY &&
        c.key !== CREDIT_CARD_CATEGORY_KEY &&
        c.key !== LENDING_CATEGORY_KEY
    );
    return creditCardMeta
      ? [...realCategories, { ...creditCardMeta, label: 'Pay Credit Card' }]
      : realCategories;
  }, [categories, creditGateActive]);

  // Same reasoning as QuickLogScreen: pad to a multiple of 4 so a partial last row always
  // gets the same space-between treatment, regardless of how many tiles are showing.
  const gridFillerCount = useMemo(
    () => (4 - (visibleCategories.length % 4)) % 4,
    [visibleCategories.length]
  );

  const amountValue = parseFloat(amountText);
  const canSave =
    !Number.isNaN(amountValue) &&
    amountValue > 0 &&
    category !== null &&
    (!isLendingCategorySelected || borrowerId !== null);

  const handleSave = () => {
    if (!canSave || category === null || !transaction) return;
    const original = new Date(transaction.timestamp);
    const timestamp = new Date(
      entryDate.getFullYear(),
      entryDate.getMonth(),
      entryDate.getDate(),
      original.getHours(),
      original.getMinutes(),
      original.getSeconds(),
      original.getMilliseconds()
    );
    const isCreditCardPaymentEntry = category === CREDIT_CARD_CATEGORY_KEY;
    const isCreditPurchaseEntry = creditGateActive && !isCreditCardPaymentEntry;
    const isLending = category === LENDING_CATEGORY_KEY;
    onSave(transaction.id, {
      amount: amountValue,
      category,
      note: note.trim() || undefined,
      timestamp,
      savingsAction: category === SAVINGS_CATEGORY_KEY ? savingsAction : undefined,
      paymentMethod: isCreditPurchaseEntry ? 'credit' : undefined,
      lendingAction: isLending ? lendingAction : undefined,
      borrowerId: isLending ? borrowerId ?? undefined : undefined,
    });
    onClose();
  };

  return (
    <>
      <Modal visible={transaction !== null} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}} onStartShouldSetResponder={() => true}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Edit Entry</Text>

            <Text style={styles.fieldLabel}>AMOUNT</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.pesoSign}>₱</Text>
              <TextInput
                style={[styles.amountInput, noWebOutline]}
                value={amountText}
                onChangeText={(v) => setAmountText(v.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                maxLength={10}
              />
            </View>

            <Text style={styles.fieldLabel}>CATEGORY</Text>

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
                  <TouchableOpacity
                    key={cat.key}
                    onPress={() => {
                      if (cat.key === CREDIT_CARD_CATEGORY_KEY && !creditGateActive) {
                        setCreditGateActive(true);
                        setCategory(null);
                        return;
                      }
                      setCategory(cat.key);
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
                    <Text
                      style={[styles.tileLabel, selected && styles.tileLabelSelected]}
                      numberOfLines={1}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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

                <Text style={styles.fieldLabel}>PERSON</Text>
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

            <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={[styles.noteInput, noWebOutline]}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Lunch with team"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={styles.fieldLabel}>DATE</Text>
            <TouchableOpacity style={styles.dateWrap} onPress={() => setDatePickerVisible(true)}>
              <Text style={styles.dateIcon}>📅</Text>
              <Text style={styles.dateText}>
                {formatFullDate(entryDate)}
                {sameDay(entryDate, new Date()) ? ' (Today)' : ''}
              </Text>
            </TouchableOpacity>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
                disabled={!canSave}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      </Modal>

      <DatePickerModal
        visible={datePickerVisible}
        value={entryDate}
        maxDate={new Date()}
        onChange={setEntryDate}
        onClose={() => setDatePickerVisible(false)}
      />

      <AddBorrowerModal
        visible={addBorrowerModalVisible}
        onSave={(name) => setBorrowerId(onAddBorrower(name))}
        onClose={() => setAddBorrowerModalVisible(false)}
      />
    </>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15,44,89,0.35)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 20,
      maxHeight: '85%',
    },
    title: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 14 },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textMuted,
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 4,
    },
    amountWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 14,
    },
    pesoSign: { fontSize: 18, fontWeight: '700', color: theme.navy, marginRight: 6 },
    amountInput: { flex: 1, fontSize: 18, fontWeight: '700', color: theme.text },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    tile: {
      width: '23.5%',
      aspectRatio: 1,
      backgroundColor: theme.background,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    tileIcon: { fontSize: 20, marginBottom: 2 },
    tileLabel: { fontSize: 9.5, fontWeight: '600', color: theme.text, textAlign: 'center' },
    tileLabelSelected: { color: '#FFFFFF' },
    tileFiller: { backgroundColor: 'transparent', borderColor: 'transparent' },
    creditGateBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 10,
    },
    creditGateBannerText: { fontSize: 13, fontWeight: '700', color: theme.text },
    creditGateBannerCancel: { fontSize: 12.5, fontWeight: '700', color: theme.danger },
    savingsToggleRow: {
      flexDirection: 'row',
      backgroundColor: theme.background,
      borderRadius: 12,
      padding: 3,
      marginBottom: 14,
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
      marginBottom: 14,
    },
    borrowerChip: {
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    borrowerChipSelected: { backgroundColor: theme.navy, borderColor: theme.navy },
    borrowerChipText: { fontSize: 13, fontWeight: '600', color: theme.text },
    borrowerChipTextSelected: { color: '#FFFFFF' },
    addBorrowerChip: { borderStyle: 'dashed' },
    addBorrowerChipText: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
    noteInput: {
      backgroundColor: theme.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.text,
      marginBottom: 14,
    },
    dateWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 18,
    },
    dateIcon: { fontSize: 15, marginRight: 8 },
    dateText: { fontSize: 14, fontWeight: '600', color: theme.text },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    cancelButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
    cancelButtonText: { color: theme.textMuted, fontWeight: '700', fontSize: 14 },
    saveButton: {
      backgroundColor: theme.navy,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
    },
    saveButtonDisabled: { backgroundColor: theme.disabled },
    saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  });
