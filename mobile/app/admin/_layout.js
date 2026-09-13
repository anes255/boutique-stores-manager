import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../src/auth';
import { colors } from '../../src/theme';
import { Loader } from '../../src/components/ui';

/** صفحة المالك: يدخلها المالك فقط. حساب المحل يُرسل إلى محله. */
export default function AdminLayout() {
  const { user, booting } = useAuth();

  if (booting) return <Loader />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href={`/store/${user.store_id}`} />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
