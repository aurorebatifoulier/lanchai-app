import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/Colors';
import { ChatMessage } from '@/lib/chat';

// ── Formatting ───────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 'Today' / 'Yesterday' / 'Wed, Aug 6' (this week) / 'Aug 5, 2026' (older). */
export function formatDaySeparator(date: Date, now: Date = new Date()): string {
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Grouping ─────────────────────────────────────────────────────────────────

export type ChatListEntry =
  | { kind: 'separator'; key: string; label: string }
  | { kind: 'message'; key: string; message: ChatMessage };

/** Walks messages (already ascending by createdAt) once, inserting a day-separator
 * entry before the first message and whenever the calendar day changes. */
export function buildDaySeparatedList(messages: ChatMessage[]): ChatListEntry[] {
  const entries: ChatListEntry[] = [];
  let lastDayKey: string | null = null;

  for (const message of messages) {
    const date = message.createdAt?.toDate();
    if (date) {
      const dayKey = startOfDay(date).toISOString();
      if (dayKey !== lastDayKey) {
        entries.push({ kind: 'separator', key: `sep-${dayKey}`, label: formatDaySeparator(date) });
        lastDayKey = dayKey;
      }
    }
    entries.push({ kind: 'message', key: message.id, message });
  }

  return entries;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.softGray200,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.fg3,
    letterSpacing: 0.3,
  },
});
