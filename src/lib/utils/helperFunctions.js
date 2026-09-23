import { Platform, ToastAndroid } from "react-native";

export const convertToSectionList = (array, groupByKey) => {
  return Object.values(
    array.reduce((acc, item) => {
      const key = item[groupByKey];

      if (!acc[key]) {
        acc[key] = {
          title: key,
          data: [],
        };
      }

      acc[key].data.push(item);

      return acc;
    }, {}),
  );
};

const durationMap = {
  1: ToastAndroid.SHORT,
  2: ToastAndroid.LONG,
};

const gravityMap = {
  1: ToastAndroid.BOTTOM,
  2: ToastAndroid.CENTER,
  3: ToastAndroid.TOP,
};

export const toastMessage = (
  message,
  duration = 1,
  gravity = 1,
  xOffset = 0,
  yOffset = 0,
) => {
  if (Platform.OS !== "android") return;

  ToastAndroid.showWithGravityAndOffset(
    String(message),
    durationMap[duration] ?? ToastAndroid.SHORT,
    gravityMap[gravity] ?? ToastAndroid.BOTTOM,
    xOffset,
    yOffset,
  );
};