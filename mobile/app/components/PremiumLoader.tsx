import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '../context/ThemeContext';

interface PremiumLoaderProps {
  visible: boolean;
  message?: string;
  progress?: number; // 0 to 100
  showProgressBar?: boolean;
}

const { width } = Dimensions.get('window');

export default function PremiumLoader({
  visible,
  message = 'Processing...',
  progress = 0,
  showProgressBar = true,
}: PremiumLoaderProps) {
  const { isDark } = useAppTheme();
  
  // Reanimated progress bar width
  const progressWidth = useSharedValue(0);

  // Animated subtle heartbeat / pulse on the container
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    progressWidth.value = withTiming(progress, { duration: 300, easing: Easing.out(Easing.ease) });
  }, [progress]);

  useEffect(() => {
    if (visible && !showProgressBar) {
      pulseScale.value = withRepeat(
        withTiming(1.02, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseScale.value = 1;
    }
  }, [visible, showProgressBar]);

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${progressWidth.value}%`,
    };
  });

  const containerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseScale.value }],
    };
  });

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <BlurView
        style={styles.absoluteFill}
        intensity={isDark ? 50 : 30}
        tint={isDark ? 'dark' : 'light'}
      >
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: isDark ? '#1a1f33' : '#ffffff' },
              containerStyle
            ]}
          >
            <LottieView
              source={require('../../assets/lottie/loader.json')}
              autoPlay
              loop
              style={styles.lottie}
              colorFilters={[{ keypath: '**', color: isDark ? '#5AC8FA' : '#007AFF' }]}
            />
            
            <Text style={[styles.message, { color: isDark ? '#ffffff' : '#0a0e1a' }]}>
              {message}
            </Text>

            {showProgressBar && (
              <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2a3044' : '#e0e5ed' }]}>
                <Animated.View style={[styles.progressFill, progressStyle, { backgroundColor: isDark ? '#5AC8FA' : '#007AFF' }]} />
              </View>
            )}

            {showProgressBar && (
              <Text style={[styles.percent, { color: isDark ? '#8a94a6' : '#6c75a0' }]}>
                {Math.round(progress)}%
              </Text>
            )}
          </Animated.View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: width * 0.75,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  lottie: {
    width: 100,
    height: 100,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
  },
  percent: {
    fontSize: 13,
    fontWeight: '600',
  },
});
