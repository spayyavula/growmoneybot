import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler, TOKEN_KEY } from "./api.js";
import { getItem, setItem } from "./storage.js";
import { disablePush } from "./push.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const clear = useCallback(async () => {
    await setItem(TOKEN_KEY, null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    (async () => {
      try {
        if (await getItem(TOKEN_KEY)) setUser((await api.me()).user);
      } catch {
        // Offline or expired: expired tokens are cleared by the 401 handler
      } finally {
        setReady(true);
      }
    })();
  }, [clear]);

  const finish = async (d) => {
    await setItem(TOKEN_KEY, d.token);
    setUser(d.user);
    return d.user;
  };

  const value = {
    user,
    ready,
    setUser,
    login: async (body) => finish(await api.login(body)),
    signup: async (body) => finish(await api.signup(body)),
    logout: async () => {
      await disablePush(); // stop sending this account's alerts to this phone
      await clear();
    },
  };
  return createElement(AuthContext.Provider, { value }, children);
}

export const useAuth = () => useContext(AuthContext);
