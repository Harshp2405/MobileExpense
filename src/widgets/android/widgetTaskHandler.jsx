import React from "react";
import { requestWidgetUpdate } from "react-native-android-widget";
import { SpendingWidget } from "./SpendingWidget";
import { loadSpendingSnapshot } from "../../lib/widgets/spendingSnapshot";

const WIDGET_NAME = "SpendingBreakdown";

function renderThemed(snapshot) {
  return {
    light: <SpendingWidget snapshot={snapshot} theme="light" />,
    dark: <SpendingWidget snapshot={snapshot} theme="dark" />,
  };
}

// Runs in headless JS when the launcher adds, resizes, or updates the widget.
export async function widgetTaskHandler(props) {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const snapshot = await loadSpendingSnapshot();
      props.renderWidget(renderThemed(snapshot));
      break;
    }
    default:
      break;
  }
}

export async function updateAndroidSpendingWidget(snapshot) {
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: () => renderThemed(snapshot),
    widgetNotFound: () => {},
  });
}
