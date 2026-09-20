// src/lib/auth/useBiometricAuth.js
import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, Platform } from "react-native";
import { authenticate, isBiometricAvailable } from "./biometricService";
import { getItem, setItem } from "../utils/storage";

const BIOMETRIC_ENABLED_KEY = "biometric_enabled";
const LOCK_TIMEOUT_MS = 30000; // 30 seconds background threshold

/**
 * @typedef {Object} BiometricAuthState
 * @property {boolean} isLocked            — true while lock screen should be shown
 * @property {boolean} isEnabled           — true if user has enabled biometric lock in settings
 * @property {boolean} isAvailable         — true if device supports biometric/PIN
 * @property {boolean} isAuthenticating    — true while biometric prompt is in progress
 * @property {string|null} authError       — last user-facing error message (null = none)
 * @property {() => Promise<void>} unlock  — trigger the biometric prompt
 * @property {(enabled: boolean) => Promise<void>} setEnabled — toggle the setting
 */

/** @returns {BiometricAuthState} */
export function useBiometricAuth() {
    const [isReady, setIsReady] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [isEnabled, setIsEnabledState] = useState(false);
    const [isAvailable, setIsAvailable] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState(null);

    const backgroundedAtRef = useRef(null);

    // Bootstrap: read persisted preference + check hardware
    useEffect(() => {
        (async () => {
            try {
                const [available, savedEnabled] = await Promise.all([
                    isBiometricAvailable(),
                    getItem(BIOMETRIC_ENABLED_KEY),
                ]);

                const enabled = savedEnabled === "true";
                setIsAvailable(available);
                setIsEnabledState(enabled);

                // Lock immediately on cold start if enabled + available
                if (enabled && available) {
                    setIsLocked(true);
                }
            } catch (err) {
                console.error("[useBiometricAuth] bootstrap error:", err);
            } finally {
                setIsReady(true);
            }
        })();
    }, []);

    // AppState listener: re-lock after background timeout
    useEffect(() => {
        if (Platform.OS === "web") return;

        const sub = AppState.addEventListener("change", (nextState) => {
            if (nextState === "background" || nextState === "inactive") {
                backgroundedAtRef.current = Date.now();
            }

            if (nextState === "active") {
                const backgroundedAt = backgroundedAtRef.current;
                if (backgroundedAt !== null) {
                    const elapsed = Date.now() - backgroundedAt;
                    if (elapsed >= LOCK_TIMEOUT_MS && isEnabled && isAvailable) {
                        setIsLocked(true);
                        setAuthError(null);
                    }
                    backgroundedAtRef.current = null;
                }
            }
        });

        return () => sub.remove();
    }, [isEnabled, isAvailable]);

    // Trigger biometric prompt
    const unlock = useCallback(async () => {
        if (isAuthenticating) return; // debounce — prevent double-prompt
        setIsAuthenticating(true);
        setAuthError(null);

        const result = await authenticate();

        if (result.success) {
            setIsLocked(false);
            setAuthError(null);
        } else {
            // Sanitized user-facing error only — no stack traces
            setAuthError(result.error);
        }

        setIsAuthenticating(false);
    }, [isAuthenticating]);

    // Toggle biometric lock setting
    const setEnabled = useCallback(async (enabled) => {
        if (enabled) {
            // Require one successful authentication before enabling
            const result = await authenticate({
                promptMessage: "Verify your identity to enable biometric lock",
            });
            if (!result.success) {
                return; // User cancelled — do not change setting
            }
        }

        setIsEnabledState(enabled);
        await setItem(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");

        // If disabling, immediately unlock
        if (!enabled) setIsLocked(false);
    }, []);

    return {
        isReady,
        isLocked,
        isEnabled,
        isAvailable,
        isAuthenticating,
        authError,
        unlock,
        setEnabled,
    };
}
