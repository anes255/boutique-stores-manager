import { Redirect, useLocalSearchParams } from 'expo-router';
import { useNav } from '../nav';
import { PUBLIC_SCREENS, SCREENS } from '../screens';

// Renders any screen by name: /<page>?p=<json params>
export default function PageRoute() {
  const { page, p } = useLocalSearchParams();
  const { session } = useNav();
  const Component = SCREENS[page];
  if (!Component || (!session && !PUBLIC_SCREENS.includes(page))) return <Redirect href="/" />;
  return <Component {...(p ? JSON.parse(p) : {})} />;
}
