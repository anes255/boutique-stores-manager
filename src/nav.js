import { createContext, useContext } from 'react';
import { router } from 'expo-router';

// { session, setSession } — session: { role: 'main'|'sub', id, username, mainId }
export const SessionContext = createContext(null);

const HOME = { main: 'MainHome', sub: 'SubHome' };

// Every screen lives at /[page]; params travel as one JSON string.
const href = (name, params) => ({
  pathname: '/[page]',
  params: params ? { page: name, p: JSON.stringify(params) } : { page: name },
});

export function useNav() {
  const { session, setSession } = useContext(SessionContext);
  return {
    session,
    canGoBack: router.canGoBack(),
    push: (name, params) => router.push(href(name, params)),
    back: () => router.canGoBack() && router.back(),
    home: () => router.canDismiss() && router.dismissAll(),
    login: (user) => {
      setSession(user);
      if (router.canDismiss()) router.dismissAll();
      router.replace(href(HOME[user.role]));
    },
    logout: () => {
      setSession(null);
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
    },
  };
}
