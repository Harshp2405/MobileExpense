// src/lib/privacy/usePrivacyMode.js
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getItem, setItem } from "../utils/storage";

const PRIVACY_KEY = "privacy_mode_enabled";

export const PrivacyContext = createContext({
    isPrivate: false,
    togglePrivacy: () => { },
});

/**
 * Provider — wrap your root layout with this.
 * @param {{ children: React.ReactNode }} props
 */
export function PrivacyProvider({ children }) {
    const [isPrivate, setIsPrivate] = useState(false);

    // Rehydrate persisted preference on mount
    useEffect(() => {
        (async () => {
            const saved = await getItem(PRIVACY_KEY);
            if (saved === "true") setIsPrivate(true);
        })();
    }, []);

    const togglePrivacy = useCallback(async () => {
        setIsPrivate((prev) => {
            const next = !prev;
            setItem(PRIVACY_KEY, next ? "true" : "false"); // fire-and-forget persist
            return next;
        });
    }, []);

    return (
        <PrivacyContext.Provider value={{ isPrivate, togglePrivacy }}>
            {children}
        </PrivacyContext.Provider>
    );
}

/**
 * Consume privacy state anywhere in the tree.
 * @returns {{ isPrivate: boolean; togglePrivacy: () => void }}
 */
export function usePrivacyMode() {
    return useContext(PrivacyContext);
}
