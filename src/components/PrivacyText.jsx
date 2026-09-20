// src/components/PrivacyText.jsx
import { Text } from "react-native";
import { usePrivacyMode } from "../lib/privacy/usePrivacyMode";

/**
 * Drop-in privacy-aware amount display component.
 *
 * @param {{
 *   value: string | number;  — formatted string OR raw number
 *   prefix?: string;         — optional currency prefix (default: "Rs.")
 *   masked?: string;         — custom mask (default: "Rs. ......")
 *   className?: string;      — NativeWind className passthrough
 *   style?: object;          — RN style passthrough
 * }} props
 */
export default function PrivacyText({
    value,
    prefix = "₹",
    masked = "₹ ••••••",
    className = "",
    style,
}) {
    const { isPrivate } = usePrivacyMode();

    const num = typeof value === "number" ? value : Number(value);
    const displayValue = isPrivate
        ? masked
        : !isNaN(num) && value !== "" && value !== null && value !== undefined
            ? `${prefix}${num.toFixed(2)}`
            : String(value ?? "");

    return (
        <Text className={className} style={style}>
            {displayValue}
        </Text>
    );
}
