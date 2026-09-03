import { CategoryKey } from './types';

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'food', label: 'Food', icon: '🍔', color: '#F97316' },
  { key: 'transportation', label: 'Transportation', icon: '🚌', color: '#3B82F6' },
  { key: 'parking', label: 'Parking', icon: '🅿️', color: '#8B5CF6' },
  { key: 'gas', label: 'Gas', icon: '⛽', color: '#EF4444' },
  { key: 'bills', label: 'Bills', icon: '💡', color: '#F59E0B' },
  { key: 'creditCard', label: 'Credit Card', icon: '💳', color: '#EC4899' },
  { key: 'savings', label: 'Savings', icon: '💰', color: '#10B981' },
  { key: 'lending', label: 'Lending', icon: '🤝', color: '#14B8A6' },
  { key: 'extra', label: 'Shopping', icon: '🛍️', color: '#6B7280' },
];

export const CATEGORY_MAP: Record<CategoryKey, CategoryMeta> = CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.key] = cat;
    return acc;
  },
  {} as Record<CategoryKey, CategoryMeta>
);

export const BUILT_IN_CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));

export const UNKNOWN_CATEGORY: CategoryMeta = {
  key: 'unknown',
  label: 'Other',
  icon: '❓',
  color: '#6B7280',
};

export const CATEGORY_ICON_CHOICES = [
  '🏠', '🚗', '🎮', '🐾', '💊', '👶', '🎓', '✈️', '🎁', '📱',
  '🎉', '🧾', '☕', '🍿', '👕', '🧴', '🔧', '📚', '🎵', '⚕️',
  '🎬', '💼', '🏋️', '🌐',
];

export const CATEGORY_COLOR_CHOICES = [
  '#F97316', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B',
  '#EC4899', '#10B981', '#6B7280', '#0EA5E9', '#84CC16',
  '#D946EF', '#14B8A6',
  '#6366F1', '#F43F5E', '#06B6D4', '#EAB308',
];
