import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';

interface PagePlaceholderProps {
  pageNumber: number;
  selected?: boolean;
  onPress?: () => void;
  selectable?: boolean;
}

export default function PagePlaceholder({
  pageNumber,
  selected = false,
  onPress,
  selectable = false,
}: PagePlaceholderProps) {
  const { isDark } = useAppTheme();

  const borderColor = selected ? '#007AFF' : isDark ? '#3a3a3c' : '#d1d1d6';
  const textColor = selected ? '#007AFF' : isDark ? '#ffffff' : '#1c1c1e';
  const bgColor = isDark ? '#1c1c1e' : '#ffffff';

  const inner = (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      {selected && (
        <View style={styles.checkBadge}>
          <Text style={styles.checkmark}>✓</Text>
        </View>
      )}
      {selectable && !selected && (
        <View style={[styles.selectCircle, { borderColor: isDark ? '#555' : '#bbb' }]} />
      )}

      <LinearGradient
        colors={selected ? ['#007AFF22', '#007AFF11'] : isDark ? ['#2c2c2e', '#1c1c1e'] : ['#f2f2f7', '#e5e5ea']}
        style={styles.docPreview}
      >
        <View style={[styles.docLine, { backgroundColor: selected ? '#007AFF55' : isDark ? '#48484a' : '#c7c7cc' }]} />
        <View style={[styles.docLine, { backgroundColor: selected ? '#007AFF44' : isDark ? '#48484a' : '#c7c7cc', width: '70%' }]} />
        <View style={[styles.docLine, { backgroundColor: selected ? '#007AFF33' : isDark ? '#48484a' : '#c7c7cc', width: '85%' }]} />
        <View style={[styles.docLine, { backgroundColor: selected ? '#007AFF22' : isDark ? '#3a3a3c' : '#d1d1d6', width: '60%' }]} />
      </LinearGradient>

      <Text style={[styles.text, { color: textColor }]}>P{pageNumber}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} testID={`page-thumb-${pageNumber}`}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  container: {
    width: 80,
    height: 110,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 6,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  docPreview: {
    width: '78%',
    height: 60,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 5,
    marginBottom: 6,
  },
  docLine: {
    width: '100%',
    height: 4,
    borderRadius: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  checkmark: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  selectCircle: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    zIndex: 1,
  },
});
