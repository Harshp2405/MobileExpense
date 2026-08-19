import { useEffect, useCallback } from "react";
import { useColorScheme } from "nativewind";
import { getItem, setItem } from "./storage";

const THEME_KEY = "theme";

export function useThemePersist() {
	const { colorScheme, setColorScheme, toggleColorScheme } = useColorScheme();

	useEffect(() => {
		(async () => {
			const saved = await getItem(THEME_KEY);
			if (saved === "dark" || saved === "light" || saved === "system") {
				setColorScheme(saved);
			}
		})();
	}, []);

	const setTheme = useCallback(
		async (mode) => {
			setColorScheme(mode);
			await setItem(THEME_KEY, mode);
		},
		[setColorScheme],
	);

	const toggle = useCallback(async () => {
		toggleColorScheme();
		const next = colorScheme === "dark" ? "light" : "dark";
		await setItem(THEME_KEY, next);
	}, [colorScheme, toggleColorScheme]);

	return { colorScheme, setTheme, toggle };
}
