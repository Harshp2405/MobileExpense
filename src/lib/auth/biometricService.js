// src/lib/auth/biometricService.js
import * as LocalAuthentication from "expo-local-authentication";

/**
 * @returns {Promise<boolean>} — true if device hardware supports biometrics
 */
export async function isBiometricAvailable() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
}

/**
 * Returns the strongest authentication level supported by the device.
 * @returns {Promise<'biometric' | 'pin' | 'none'>}
 */
export async function getSupportedAuthLevel() {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (
        types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ||
        types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) || 
        types.includes(LocalAuthentication.AuthenticationType.IRIS)
    ) {
        return "biometric";
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (isEnrolled) return "pin";

    return "none";
}

/**
 * Prompt the user with biometric / device-credentials gate.
 * Falls back to device PIN automatically if biometric fails.
 *
 * @param {object} options
 * @param {string} [options.promptMessage]
 * @param {boolean} [options.allowFallback] — whether device PIN/password is accepted
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function authenticate({
    promptMessage = "Confirm your identity to access Expense Tracker",
    allowFallback = true,
} = {}) {
    try {
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage,
            fallbackLabel: "Use PIN",
            disableDeviceFallback: !allowFallback,
            cancelLabel: "Cancel",
        });

        if (result.success) {
            return { success: true };
        }

        // Typed error map — never leak raw SDK error strings to the UI
        const errorMap = {
            UserCancel: "Authentication cancelled.",
            UserFallback: "Fallback requested.",
            SystemCancel: "System interrupted authentication.",
            PasscodeNotSet: "No device PIN or biometric is enrolled.",
            AuthenticationFailed: "Authentication failed. Please try again.",
            NotAvailable: "Biometric authentication is not available.",
            NotEnrolled: "No biometric credentials enrolled on this device.",
            Lockout: "Too many attempts. Device is locked.",
            LockoutPermanent: "Device is permanently locked. Please unlock via settings.",
        };

        const errorKey = result.error ?? "AuthenticationFailed";
        return {
            success: false,
            error: errorMap[errorKey] ?? "Authentication failed. Please try again.",
        };
    } catch (err) {
        // Never expose raw exception messages to the caller
        console.error("[biometricService] authenticate threw:", err);
        return { success: false, error: "An unexpected error occurred during authentication." };
    }
}
