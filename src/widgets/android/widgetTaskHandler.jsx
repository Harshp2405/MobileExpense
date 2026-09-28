"use no memo";
import React from "react";
import { requestWidgetUpdate } from "react-native-android-widget";
import { SpendingWidget } from "./SpendingWidget";
import {
  loadSpendingSnapshot,
  getDefaultSpendingSnapshot,
} from "../../lib/widgets/spendingSnapshot";

const WIDGET_NAME = "SpendingBreakdown";

function renderThemed(snapshot) {
  const safeSnapshot = snapshot || getDefaultSpendingSnapshot();
  return {
    light: <SpendingWidget snapshot={safeSnapshot} theme="light" />,
    dark: <SpendingWidget snapshot={safeSnapshot} theme="dark" />,
  };
}

// Runs in headless JS when the launcher adds, resizes, or updates the widget.
export async function widgetTaskHandler(props) {
  if (props.widgetInfo?.widgetName !== WIDGET_NAME) return;

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      try {
        const snapshot = await loadSpendingSnapshot();
        props.renderWidget(renderThemed(snapshot));
      } catch (error) {
        console.warn("[widgetTaskHandler] error rendering widget:", error);
        try {
          props.renderWidget(renderThemed(getDefaultSpendingSnapshot()));
        } catch (innerError) {
          console.error("[widgetTaskHandler] failed fallback render:", innerError);
        }
      }
      break;
    }
    default:
      break;
  }
}

export async function updateAndroidSpendingWidget(snapshot) {
  try {
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => renderThemed(snapshot),
      widgetNotFound: () => {},
    });
  } catch (error) {
    console.warn("[updateAndroidSpendingWidget] Widget update failed:", error);
  }
}
