import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppTheme, useTheme } from '../theme';
import { noWebOutline } from '../webInputStyle';

interface Props {
  visible: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function AddBorrowerModal({ visible, onSave, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave(name.trim());
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>New Person</Text>
          <TextInput
            style={[styles.input, noWebOutline]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Maria"
            placeholderTextColor={theme.textMuted}
            autoFocus
            maxLength={30}
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
              disabled={!canSave}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    sheet: { backgroundColor: theme.card, borderRadius: 16, padding: 20 },
    title: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 14 },
    input: {
      backgroundColor: theme.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text,
      marginBottom: 16,
    },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    cancelButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
    cancelButtonText: { color: theme.textMuted, fontWeight: '700', fontSize: 14 },
    saveButton: {
      backgroundColor: theme.navy,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 10,
    },
    saveButtonDisabled: { backgroundColor: theme.disabled },
    saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  });
