// Native implementation using AsyncStorage
import AsyncStorage from "@react-native-async-storage/async-storage";

export const getItem = async (key) => {
  return await AsyncStorage.getItem(key);
};

export const setItem = async (key, value) => {
  await AsyncStorage.setItem(key, value);
};
