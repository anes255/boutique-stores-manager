import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';
import { colors, font, type } from '../src/theme';
import { Loader } from '../src/components/ui';

export default function Gate() {
  const { user, booting } = useAuth();

  if (booting) {
    return (
      <View style={styles.splash}>
        <View style={styles.mark}><Text style={styles.markText}>م</Text></View>
        <Text style={[type.title, { marginTop: 14 }]}>متجري</Text>
        <Text style={type.label}>كل محلاتك في مكان واحد</Text>
        <View style={{ height: 26 }} />
        <Loader text="" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (user.role === 'admin') return <Redirect href="/admin" />;
  if (user.store_id) return <Redirect href={`/store/${user.store_id}`} />;
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  mark: {
    width: 74, height: 74, borderRadius: 26, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  markText: { fontFamily: font.display, fontSize: 34, color: colors.white, lineHeight: 52 },
});
