import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";

const SIZE = 120;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function buildDonutSvg(slices, trackColor) {
  let offset = 0;
  const arcs = slices
    .filter((slice) => slice.percentage > 0)
    .map((slice) => {
      const length = (slice.percentage / 100) * CIRCUMFERENCE;
      const arc = `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${RADIUS}" fill="none" stroke="${slice.color}" stroke-width="${STROKE}" stroke-dasharray="${length} ${CIRCUMFERENCE - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${SIZE / 2} ${SIZE / 2})"/>`;
      offset += length;
      return arc;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${RADIUS}" fill="none" stroke="${trackColor}" stroke-width="${STROKE}"/>${arcs}</svg>`;
}

function formatTotal(value) {
  const amount = Number(value) || 0;
  return amount >= 1000
    ? `₹${(amount / 1000).toFixed(1)}k`
    : `₹${amount.toFixed(0)}`;
}

export function SpendingWidget({ snapshot, theme = "light" }) {
  const dark = theme === "dark";
  const background = dark ? "#18181B" : "#FFFFFF";
  const primaryText = dark ? "#F4F4F5" : "#111827";
  const secondaryText = dark ? "#A1A1AA" : "#6B7280";
  const track = dark ? "#3F3F46" : "#E5E7EB";
  const slices = snapshot?.slices ?? [];

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: background,
        borderRadius: 24,
        padding: 14,
        flexDirection: "column",
      }}
    >
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <TextWidget
          text="Category Breakdown"
          style={{ fontSize: 14, fontWeight: "700", color: primaryText }}
        />
        <TextWidget
          text={snapshot?.monthLabel ?? ""}
          style={{ fontSize: 11, color: secondaryText }}
        />
      </FlexWidget>

      {slices.length === 0 ? (
        <FlexWidget
          style={{
            width: "match_parent",
            height: "match_parent",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TextWidget
            text="No expenses this month"
            style={{ fontSize: 12, color: secondaryText }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <FlexWidget
            style={{ justifyContent: "center", alignItems: "center" }}
          >
            <SvgWidget
              svg={buildDonutSvg(slices, track)}
              style={{ height: SIZE, width: SIZE }}
            />
            <TextWidget
              text={formatTotal(snapshot.total)}
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: primaryText,
                marginTop: 4,
              }}
            />
          </FlexWidget>

          <FlexWidget
            style={{ flex: 1, flexDirection: "column", marginLeft: 12 }}
          >
            {slices.map((slice) => (
              <FlexWidget
                key={slice.name}
                style={{
                  width: "match_parent",
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <FlexWidget
                  style={{
                    height: 10,
                    width: 10,
                    borderRadius: 5,
                    backgroundColor: slice.color,
                    marginRight: 6,
                  }}
                />
                <TextWidget
                  text={slice.name}
                  maxLines={1}
                  truncate="END"
                  style={{ flex: 1, fontSize: 11, color: primaryText }}
                />
                <TextWidget
                  text={`${slice.percentage.toFixed(0)}%`}
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: secondaryText,
                  }}
                />
              </FlexWidget>
            ))}
          </FlexWidget>
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
