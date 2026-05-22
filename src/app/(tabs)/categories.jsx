import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { getCategories, addCategory, deleteCategory } from "../../lib/db/queries";

const COLORS = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6"];

export default function CategoriesScreen() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getCategories();
      setCategories(data || []);
    } catch (error) {
      console.error("Failed to load categories", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const resetForm = () => {
    setName("");
    setSelectedColor(COLORS[0]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Category name is required");
      return;
    }
    try {
      setSaving(true);
      await addCategory({ name: name.trim(), color: selectedColor });
      resetForm();
      setModalVisible(false);
      await loadData();
    } catch (error) {
      Alert.alert("Error", "Category already exists or failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, catName) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${catName}"?\n\nAll expenses belonging to this category will be moved to "General".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCategory(id, catName);
              await loadData();
            } catch (error) {
              Alert.alert("Error", "Failed to delete category");
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={categories}
          contentContainerClassName="p-5"
          ListHeaderComponent={
            <View className="flex-row justify-between items-center mb-6 mt-2">
              <Text className="text-3xl font-black text-gray-900">Categories</Text>
              <TouchableOpacity onPress={() => setModalVisible(true)} className="bg-blue-600 w-10 h-10 rounded-full items-center justify-center shadow-sm">
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 w-full">
              <Ionicons name="folder-open-outline" size={64} color="#D1D5DB" />
              <Text className="text-gray-400 mt-4 text-base font-medium">No categories added</Text>
            </View>
          }
          numColumns={2}
          columnWrapperClassName="gap-4"
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <View className="bg-white p-4 rounded-3xl mb-4 shadow-sm border border-gray-100 flex-1 items-center justify-center py-8 relative">
              <TouchableOpacity
                onPress={() => handleDelete(item.id, item.name)}
                className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-red-50 items-center justify-center shadow-sm"
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>

              <View className="w-14 h-14 rounded-full items-center justify-center mb-3 bg-blue-50">
                <Ionicons name="folder" size={28} color={item.color || "#3B82F6"} />
              </View>
              <Text className="text-base font-bold text-gray-900">{item.name}</Text>
            </View>
          )}
        />
      )}

      {/* Add Category Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-gray-900">New Category</Text>
              <TouchableOpacity onPress={() => { resetForm(); setModalVisible(false); }}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="text-sm font-semibold text-gray-700 mb-1.5">Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Food, Transport"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-5"
              placeholderTextColor="#9CA3AF"
            />

            <Text className="text-sm font-semibold text-gray-700 mb-3">Color</Text>
            <View className="flex-row flex-wrap gap-3 mb-6">
              {COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setSelectedColor(color)}
                  className={`w-10 h-10 rounded-full items-center justify-center ${selectedColor === color ? "border-2 border-gray-900" : ""}`}
                  style={{ backgroundColor: color }}
                >
                  {selectedColor === color && <Ionicons name="checkmark" size={18} color="white" />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className={`rounded-2xl py-4 items-center ${saving ? "bg-blue-300" : "bg-blue-600"}`}
            >
              <Text className="text-white font-bold text-base">{saving ? "Saving..." : "Add Category"}</Text>
            </TouchableOpacity>

            <View className="h-4" />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
