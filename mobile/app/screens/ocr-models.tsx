import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import * as Haptics from 'expo-haptics';
import { downloadOcrModel, isOcrModelDownloaded } from '../utils/paddleOcrService';

const AVAILABLE_MODELS = [
  { id: 'en', label: 'English', size: '14.5 MB' },
  { id: 'bn', label: 'Bengali (বাংলা)', size: '28.2 MB' },
  { id: 'ar', label: 'Arabic (العربية)', size: '18.9 MB' },
  { id: 'mixed', label: 'Mixed Language', size: '32.1 MB' },
];

export default function OcrModelsScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const router = useRouter();
  
  const [modelStatus, setModelStatus] = useState<Record<string, 'checking' | 'active' | 'missing' | 'downloading'>>({});

  const bg = isDark ? '#0a0e1a' : '#f0f2f8';
  const cardBg = isDark ? '#141824' : '#ffffff';
  const text = isDark ? '#ffffff' : '#0a0e1a';
  const muted = isDark ? '#6e7a9a' : '#6c75a0';
  const border = isDark ? '#1e2538' : '#e2e5f0';
  const accent = '#007AFF';

  useEffect(() => {
    checkModels();
  }, []);

  const checkModels = async () => {
    const status: Record<string, 'checking' | 'active' | 'missing'> = {};
    for (const m of AVAILABLE_MODELS) {
      status[m.id] = 'checking';
    }
    setModelStatus({ ...status });

    for (const m of AVAILABLE_MODELS) {
      try {
        const isDownloaded = await isOcrModelDownloaded(m.id);
        status[m.id] = isDownloaded ? 'active' : 'missing';
      } catch (e) {
        status[m.id] = 'missing';
      }
    }
    setModelStatus({ ...status });
  };

  const handleDownload = async (modelId: string, modelName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setModelStatus(prev => ({ ...prev, [modelId]: 'downloading' }));
    
    try {
      const success = await downloadOcrModel(modelId);
      if (success) {
        setModelStatus(prev => ({ ...prev, [modelId]: 'active' }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error('Native download failed');
      }
    } catch (e: any) {
      setModelStatus(prev => ({ ...prev, [modelId]: 'missing' }));
      Alert.alert('Download Failed', `Could not download ${modelName} model.`);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: text }]}>Offline OCR Models</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
        <View style={[styles.infoCard, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={styles.infoIcon}>📴</Text>
          <Text style={[styles.infoTitle, { color: text }]}>PP-OCRv5 Offline Models</Text>
          <Text style={[styles.infoText, { color: muted }]}>
            Download language packs to perform Optical Character Recognition entirely on your device, without requiring an internet connection.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: muted }]}>AVAILABLE LANGUAGES</Text>

        <View style={[styles.listContainer, { backgroundColor: cardBg, borderColor: border }]}>
          {AVAILABLE_MODELS.map((m, index) => {
            const status = modelStatus[m.id] || 'checking';
            const isLast = index === AVAILABLE_MODELS.length - 1;
            
            return (
              <View 
                key={m.id} 
                style={[
                  styles.row, 
                  { borderBottomColor: border, borderBottomWidth: isLast ? 0 : 1 }
                ]}
              >
                <View style={styles.rowBody}>
                  <Text style={[styles.modelName, { color: text }]}>{m.label}</Text>
                  <Text style={[styles.modelSize, { color: muted }]}>{m.size}</Text>
                </View>
                
                {status === 'checking' && (
                  <ActivityIndicator size="small" color={muted} />
                )}
                
                {status === 'active' && (
                  <View style={[styles.badge, { backgroundColor: '#34C75922' }]}>
                    <Text style={[styles.badgeText, { color: '#34C759' }]}>INSTALLED</Text>
                  </View>
                )}
                
                {status === 'downloading' && (
                  <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
                    <ActivityIndicator size="small" color={accent} style={{ marginRight: 6, transform: [{ scale: 0.7 }] }} />
                    <Text style={[styles.badgeText, { color: accent }]}>DOWNLOADING...</Text>
                  </View>
                )}
                
                {status === 'missing' && (
                  <TouchableOpacity 
                    style={[styles.downloadBtn, { backgroundColor: accent }]}
                    onPress={() => handleDownload(m.id, m.label)}
                  >
                    <Text style={styles.downloadBtnText}>Download</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 17, fontWeight: '500' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  
  scrollPad: { padding: 16, paddingBottom: 40 },
  
  infoCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoIcon: { fontSize: 40, marginBottom: 12 },
  infoTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  infoText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 },
  
  listContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  rowBody: { flex: 1 },
  modelName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  modelSize: { fontSize: 12 },
  
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  
  downloadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  downloadBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
