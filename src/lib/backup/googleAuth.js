// src/lib/backup/googleAuth.js
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

const KEYS = {
  ACCESS_TOKEN: "gdrive_access_token",
  REFRESH_TOKEN: "gdrive_refresh_token",
  EXPIRY: "gdrive_token_expiry",
};

export function getGoogleClientId() {
  // if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  // }
  // if (Platform.OS === "ios") {
  //   return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  // }
  // return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
}

export function getRedirectUri() {
  return AuthSession.makeRedirectUri({
    scheme: "mobile",
    path: "oauthredirect",
  });
}

export async function saveTokens({ accessToken, refreshToken, expiresIn }) {
  const expiry = Date.now() + expiresIn * 1000;
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken);
  if (refreshToken)
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken);
  await SecureStore.setItemAsync(KEYS.EXPIRY, String(expiry));
}

export async function getValidAccessToken() {
  const expiry = await SecureStore.getItemAsync(KEYS.EXPIRY);
  const accessToken = await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  const refreshToken = await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);

  if (!accessToken) return null;

  // Still valid (with 60s buffer)
  if (expiry && Date.now() < Number(expiry) - 60_000) return accessToken;

  // Refresh
  if (refreshToken) {
    const clientId = getGoogleClientId();
    if (!clientId) {
      await clearTokens();
      return null;
    }

    const res = await fetch(DISCOVERY.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      await clearTokens();
      return null;
    }

    const data = await res.json();
    await saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    });
    return data.access_token;
  }

  return null;
}

export async function isLoggedIn() {
  return (await getValidAccessToken()) !== null;
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(KEYS.EXPIRY);
}
