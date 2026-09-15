// src/components/ReceiptPicker.jsx
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  takePhoto,
  pickImageFromGallery,
  deleteLocalImage,
} from "../lib/utils/imageManager";

export default function ReceiptPicker({
  imageUri,
  onImageSelected,
  onImageRemoved,
  isDark,
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const handleCamera = async () => {
    setModalVisible(false);
    const uri = await takePhoto();
    if (uri) onImageSelected(uri);
  };

  const handleGallery = async () => {
    setModalVisible(false);
    const uri = await pickImageFromGallery();
    if (uri) onImageSelected(uri);
  };

  const handleRemove = async () => {
    if (imageUri) {
      await deleteLocalImage(imageUri);
    }
    onImageRemoved();
  };

  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
        Receipt / Bill Image (Optional)
      </Text>

      {imageUri ? (
        <View className="relative flex-row items-center gap-3 p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl">
          <TouchableOpacity onPress={() => setPreviewVisible(true)}>
            <Image
              source={{ uri: imageUri }}
              className="w-16 h-16 rounded-lg bg-gray-200"
              resizeMode="cover"
            />
          </TouchableOpacity>

          <View className="flex-1">
            <Text className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              Receipt attached
            </Text>
            <TouchableOpacity onPress={() => setPreviewVisible(true)}>
              <Text className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Tap to view full image
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleRemove}
            className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center"
          >
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          className="flex-row items-center justify-center gap-2 p-3.5 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-900/50"
        >
          <Ionicons
            name="camera-outline"
            size={20}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            Attach Bill / Receipt Photo
          </Text>
        </TouchableOpacity>
      )}

      {/* Choice Modal: Camera vs Gallery */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
          className="flex-1 justify-end bg-black/50"
        >
          <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6">
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 text-center">
              Add Bill or Receipt Photo
            </Text>

            <View className="flex-row gap-4 mb-3">
              <TouchableOpacity
                onPress={handleCamera}
                className="flex-1 items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800"
              >
                <Ionicons name="camera" size={28} color="#2563EB" />
                <Text className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-2">
                  Take Photo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleGallery}
                className="flex-1 items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800"
              >
                <Ionicons name="images" size={28} color="#9333EA" />
                <Text className="text-sm font-bold text-purple-600 dark:text-purple-400 mt-2">
                  From Gallery
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              className="py-3 items-center"
            >
              <Text className="text-sm font-semibold text-gray-500">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Fullscreen Preview Modal */}
      {imageUri && (
        <Modal visible={previewVisible} transparent animationType="fade">
          <View className="flex-1 bg-black/90 justify-center items-center p-4">
            <TouchableOpacity
              onPress={() => setPreviewVisible(false)}
              className="absolute top-12 right-6 z-10 w-10 h-10 rounded-full bg-white/20 items-center justify-center"
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>

            <Image
              source={{ uri: imageUri }}
              className="w-full h-4/5 rounded-2xl"
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}
    </View>
  );
}
