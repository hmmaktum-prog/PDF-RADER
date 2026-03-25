import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  TextInput,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isQpdfLinked, isMupdfLinked, isAndroidPlatform } from '../utils/nativeModules';

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, theme, setTheme } = useAppTheme();
  const router = useRouter();
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [geminiKey, setGeminiKey] = useState('');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [qpdfStatus, setQpdfStatus] = useState<'checking' | 'active' | 'missing' | 'android-only'>('checking');
  const [mupdfStatus, setMupdfStatus] = useState<'checking' | 'active' | 'missing' | 'android-only'>('checking');

  useEffect(() => {
    loadGeminiKey();
    checkEngines();
  }, []);

  const checkEngines = async () => {
    if (!isAndroidPlatform) {
      setQpdfStatus('android-only');
      setMupdfStatus('android-only');
      return;
    }
    try {
      const qLinked = await isQpdfLinked();
      const mLinked = await isMupdfLinked();
      setQpdfStatus(qLinked ? 'active' : 'missing');
      setMupdfStatus(mLinked ? 'active' : 'missing');
    } catch (e) {
      setQpdfStatus('missing');
      setMupdfStatus('missing');
    }
  };

  const loadGeminiKey = async () => {
    try {
      const key = await AsyncStorage.getItem('gemini_api_key');
      setHasGeminiKey(!!key);
      if (key) {
        setGeminiKey(key);
      }
    } catch (e) {
      console.error('Failed to load Gemini API key:', e);
    }
  };

  const saveGeminiKey = async () => {
    if (!geminiKey.trim()) {
      Alert.alert('Validation', 'Please enter a valid API key');
      return;
    }
    try {
      await AsyncStorage.setItem('gemini_api_key', geminiKey.trim());
      setHasGeminiKey(true);
      setShowGeminiModal(false);
      Alert.alert('Success', 'Gemini API key saved');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Failed to save API key');
    }
  };

  const deleteGeminiKey = async () => {
    Alert.alert('Remove API Key', 'Are you sure?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Remove',
        onPress: async () => {
          try {
            await AsyncStorage.removeItem('gemini_api_key');
            setHasGeminiKey(false);
            setGeminiKey('');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            Alert.alert('Error', 'Failed to remove API key');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const bg = isDark ? '#0a0e1a' : '#f0f2f8';
  const cardBg = isDark ? '#141824' : '#ffffff';
  const text = isDark ? '#ffffff' : '#0a0e1a';
  const muted = isDark ? '#6e7a9a' : '#6c75a0';
  const border = isDark ? '#1e2538' : '#e2e5f0';
  const accent = '#007AFF';

  const themeOptions = [
    { id: 'light', label: 'Light', icon: '☀️' },
    { id: 'dark', label: 'Dark', icon: '🌙' },
    { id: 'system', label: 'System', icon: '🌗' },
  ] as const;

  const SettingRow = ({
    icon, label, subtitle, right, onPress,
  }: {
    icon: string; label: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: cardBg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: text }]}>{label}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: accent }]}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: text }]}>Settings</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Theme Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: muted }]}>APPEARANCE</Text>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.cardTitle, { color: text }]}>🎨  App Theme</Text>
            <View style={styles.themeRow}>
              {themeOptions.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.themeBtn,
                    { borderColor: theme === opt.id ? accent : border, backgroundColor: theme === opt.id ? accent + '18' : bg },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTheme(opt.id);
                  }}
                >
                  <Text style={styles.themeIcon}>{opt.icon}</Text>
                  <Text style={[styles.themeLabel, { color: theme === opt.id ? accent : muted }]}>{opt.label}</Text>
                  {theme === opt.id && (
                    <View style={[styles.themeDot, { backgroundColor: accent }]} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Processing Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: muted }]}>PROCESSING ENGINES</Text>
          <SettingRow
            icon="⚙️"
            label="QPDF Engine"
            subtitle={
              qpdfStatus === 'active' ? 'NDK C++ Engine Active' :
              qpdfStatus === 'android-only' ? 'Runs on Android device' :
              'Native Library Missing (.so)'
            }
            right={
              <View style={[styles.badge, {
                backgroundColor:
                  qpdfStatus === 'active' ? '#34C75922' :
                  qpdfStatus === 'android-only' ? '#007AFF22' :
                  '#FF3B3022'
              }]}>
                <Text style={{
                  color:
                    qpdfStatus === 'active' ? '#34C759' :
                    qpdfStatus === 'android-only' ? '#007AFF' :
                    '#FF3B30',
                  fontSize: 11, fontWeight: '700'
                }}>
                  {qpdfStatus === 'checking' ? '...' :
                   qpdfStatus === 'active' ? 'ACTIVE' :
                   qpdfStatus === 'android-only' ? 'READY' :
                   'MISSING'}
                </Text>
              </View>
            }
          />
          <SettingRow
            icon="🖼️"
            label="MuPDF Engine"
            subtitle={
              mupdfStatus === 'active' ? 'NDK C++ Engine Active' :
              mupdfStatus === 'android-only' ? 'Runs on Android device' :
              'Native Library Missing (.so)'
            }
            right={
              <View style={[styles.badge, {
                backgroundColor:
                  mupdfStatus === 'active' ? '#34C75922' :
                  mupdfStatus === 'android-only' ? '#007AFF22' :
                  '#FF3B3022'
              }]}>
                <Text style={{
                  color:
                    mupdfStatus === 'active' ? '#34C759' :
                    mupdfStatus === 'android-only' ? '#007AFF' :
                    '#FF3B30',
                  fontSize: 11, fontWeight: '700'
                }}>
                  {mupdfStatus === 'checking' ? '...' :
                   mupdfStatus === 'active' ? 'ACTIVE' :
                   mupdfStatus === 'android-only' ? 'READY' :
                   'MISSING'}
                </Text>
              </View>
            }
          />
          <SettingRow
            icon="📴"
            label="Offline Mode"
            subtitle="All processing happens on your device"
            right={<View style={[styles.badge, { backgroundColor: '#007AFF22' }]}><Text style={{ color: '#007AFF', fontSize: 11, fontWeight: '700' }}>SECURE</Text></View>}
          />
        </View>

        {/* Output Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: muted }]}>OUTPUT</Text>
          <SettingRow
            icon="📁"
            label="Output Location"
            subtitle="App Documents / PDFPowerTools"
            right={<Text style={[styles.arrow, { color: muted }]}>›</Text>}
          />
        </View>

        {/* AI Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: muted }]}>AI & OCR</Text>
          <SettingRow
            icon="🤖"
            label="Gemini AI Model"
            subtitle={hasGeminiKey ? 'API key configured ✓' : 'Click to add API key'}
            onPress={() => setShowGeminiModal(true)}
            right={<Text style={[styles.arrow, { color: muted }]}>›</Text>}
          />
          <SettingRow
            icon="🌐"
            label="Default OCR Language"
            subtitle="Bengali (বাংলা)"
            right={<Text style={[styles.arrow, { color: muted }]}>›</Text>}
          />
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: muted }]}>ABOUT</Text>
          <SettingRow icon="📄" label="PDF Power Tools" subtitle={`Version ${APP_VERSION}`} />
          <SettingRow icon="⚙️" label="Engine" subtitle="QPDF + MuPDF NDK (Native C++)" />
          <SettingRow icon="🛠️" label="Total Tools" subtitle="20+ PDF operations" />
        </View>

        {/* App Branding */}
        <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
          <LinearGradient
            colors={['#0d2760', '#1a4fd6']}
            style={styles.brandBadge}
          >
            <Text style={{ fontSize: 24 }}>📑</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, marginTop: 4 }}>PDF Power Tools</Text>
            <Text style={{ color: '#ffffff88', fontSize: 11, marginTop: 2 }}>v{APP_VERSION} · NDK Powered</Text>
          </LinearGradient>
        </View>
      </ScrollView>

      {/* Gemini API Key Modal */}
      <Modal
        visible={showGeminiModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGeminiModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: isDark ? '#000000aa' : '#00000055' }]}>
          <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[styles.modalTitle, { color: text }]}>🤖 Gemini API Key</Text>
              <TouchableOpacity onPress={() => setShowGeminiModal(false)}>
                <Text style={{ color: muted, fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: muted }]}>Enter your Gemini API key for OCR features</Text>

            <TextInput
              style={[
                styles.apiKeyInput,
                {
                  backgroundColor: isDark ? '#2a2a2e' : '#f0f0f0',
                  borderColor: border,
                  color: text,
                },
              ]}
              placeholder="AIza..."
              placeholderTextColor={muted}
              value={geminiKey}
              onChangeText={setGeminiKey}
              secureTextEntry={true}
              editable={true}
            />

            <Text style={[styles.helpText, { color: muted }]}>
              Get your API key from{'\n'}
              <Text style={{ color: '#007AFF', fontWeight: '600' }}>console.cloud.google.com</Text>
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#FF3B3022', borderColor: '#FF3B30' }]}
                onPress={deleteGeminiKey}
              >
                <Text style={{ color: '#FF3B30', fontWeight: '600' }}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: accent, borderColor: accent }]}
                onPress={saveGeminiKey}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save Key</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingTop: 4,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 17, fontWeight: '500' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },

  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },

  card: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  themeIcon: { fontSize: 20, marginBottom: 4 },
  themeLabel: { fontSize: 12, fontWeight: '600' },
  themeDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1,
    marginBottom: 8,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 4,
  },
  rowIcon: { fontSize: 22, marginRight: 12 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  arrow: { fontSize: 24, fontWeight: '300' },

  brandBadge: {
    paddingVertical: 20, paddingHorizontal: 40, borderRadius: 20,
    alignItems: 'center',
    elevation: 6, shadowColor: '#1a4fd6', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalLabel: {
    fontSize: 14,
    marginBottom: 14,
    lineHeight: 20,
  },
  apiKeyInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  helpText: {
    fontSize: 12,
    marginBottom: 20,
    lineHeight: 18,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
});
