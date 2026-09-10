import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  getCategories,
  addCategory,
  deleteCategory,
  getSubcategories,
  addSubcategory,
  deleteSubcategory,
} from "../../lib/db/queries";

const COLORS = [
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
];

export default function CategoriesScreen() {
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  // NEW: subcategory management state
  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState({});
  const [subModalVisible, setSubModalVisible] = useState(false);
  const [subModalCategoryId, setSubModalCategoryId] = useState(null);
  const [subName, setSubName] = useState("");
  const [subSaving, setSubSaving] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

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
    const message = `Are you sure you want to delete "${catName}"?\n\nAll subcategories will be removed and expenses belonging to this category will be moved to "General".`;
    const runDelete = async () => {
      try {
        await deleteCategory(id, catName);
        await loadData();
      } catch (error) {
        Alert.alert("Error", "Failed to delete category");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) runDelete();
      return;
    }
    Alert.alert("Delete Category", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: runDelete },
    ]);
  };

  // NEW: toggle expand + lazy load subcategories
  const toggleExpand = async (categoryId) => {
    if (expandedCategoryId === categoryId) {
      setExpandedCategoryId(null);
      return;
    }
    setExpandedCategoryId(categoryId);
    if (!subcategoriesByCategory[categoryId]) {
      const subs = await getSubcategories(categoryId);
      setSubcategoriesByCategory((prev) => ({
        ...prev,
        [categoryId]: subs || [],
      }));
    }
  };

  // NEW: open add-subcategory modal
  const openSubModal = (categoryId) => {
    setSubModalCategoryId(categoryId);
    setSubName("");
    setSubModalVisible(true);
  };

  // NEW: save subcategory
  const handleSaveSub = async () => {
    if (!subName.trim()) {
      Alert.alert("Error", "Subcategory name is required");
      return;
    }
    try {
      setSubSaving(true);
      await addSubcategory({
        categoryId: subModalCategoryId,
        name: subName.trim(),
      });
      const subs = await getSubcategories(subModalCategoryId);
      setSubcategoriesByCategory((prev) => ({
        ...prev,
        [subModalCategoryId]: subs || [],
      }));
      setSubModalVisible(false);
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to save subcategory");
    } finally {
      setSubSaving(false);
    }
  };

  // NEW: delete subcategory
  const handleDeleteSub = (categoryId, subId, subName) => {
    const message = `Delete "${subName}"? Expenses using it will keep their category but lose this subcategory.`;
    const runDelete = async () => {
      try {
        await deleteSubcategory(subId);
        const subs = await getSubcategories(categoryId);
        setSubcategoriesByCategory((prev) => ({
          ...prev,
          [categoryId]: subs || [],
        }));
      } catch (error) {
        Alert.alert("Error", "Failed to delete subcategory");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) runDelete();
      return;
    }
    Alert.alert("Delete Subcategory", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: runDelete },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900">
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
              <Text className="text-3xl font-black text-gray-900 dark:text-gray-100">
                Categories
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                className="bg-blue-600 w-10 h-10 rounded-full items-center justify-center shadow-sm"
              >
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 w-full">
              <Ionicons name="folder-open-outline" size={64} color="#D1D5DB" />
              <Text className="text-gray-400 dark:text-gray-500 mt-4 text-base font-medium">
                No categories added
              </Text>
            </View>
          }
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const isExpanded = expandedCategoryId === item.id;
            const subs = subcategoriesByCategory[item.id] || [];

            return (
              <View className="bg-white dark:bg-zinc-800 rounded-3xl mb-4 shadow-sm border border-gray-100 dark:border-zinc-700 overflow-hidden">
                <TouchableOpacity
                  onPress={() => toggleExpand(item.id)}
                  className="flex-row items-center p-4"
                >
                  <View className="w-12 h-12 rounded-full items-center justify-center mr-3 bg-blue-50 dark:bg-blue-900/30">
                    <Ionicons
                      name="folder"
                      size={24}
                      color={item.color || "#3B82F6"}
                    />
                  </View>
                  <Text className="text-base font-bold text-gray-900 dark:text-gray-100 flex-1">
                    {item.name}
                  </Text>

                  <Text className="text-base  text-gray-900 dark:text-gray-100 mx-2">
                    {item.subcategories.length}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id, item.name)}
                    className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 items-center justify-center mr-2"
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View className="px-4 pb-4 border-t border-gray-100 dark:border-zinc-700 pt-3">
                    {subs.length === 0 ? (
                      <Text className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                        No subcategories yet
                      </Text>
                    ) : (
                      subs.map((sub) => (
                        <View
                          key={sub.id}
                          className="flex-row items-center justify-between py-2"
                        >
                          <Text className="text-sm text-gray-700 dark:text-gray-300">
                            {sub.name}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              handleDeleteSub(item.id, sub.id, sub.name)
                            }
                          >
                            <Ionicons
                              name="close-circle-outline"
                              size={18}
                              color="#EF4444"
                            />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                    <TouchableOpacity
                      onPress={() => openSubModal(item.id)}
                      className="flex-row items-center mt-1"
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={18}
                        color="#2563EB"
                      />
                      <Text className="text-sm font-semibold text-blue-600 ml-1">
                        Add Subcategory
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Add Category Modal (unchanged) */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
            <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  New Category
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    resetForm();
                    setModalVisible(false);
                  }}
                >
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text className="text-sm font-semibold text-gray-700 mb-1.5">
                Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Food, Transport"
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-5"
                placeholderTextColor="#9CA3AF"
              />
              <Text className="text-sm font-semibold text-gray-700 mb-3">
                Color
              </Text>
              <View className="flex-row flex-wrap gap-3 mb-6">
                {COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    className={`w-10 h-10 rounded-full items-center justify-center ${selectedColor === color ? "border-2 border-gray-900" : ""}`}
                    style={{ backgroundColor: color }}
                  >
                    {selectedColor === color && (
                      <Ionicons name="checkmark" size={18} color="white" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className={`rounded-2xl py-4 items-center ${saving ? "bg-blue-300" : "bg-blue-600"}`}
              >
                <Text className="text-white font-bold text-base">
                  {saving ? "Saving..." : "Add Category"}
                </Text>
              </TouchableOpacity>
              <View className="h-4" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* NEW: Add Subcategory Modal */}
      <Modal visible={subModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
            <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  New Subcategory
                </Text>
                <TouchableOpacity onPress={() => setSubModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text className="text-sm font-semibold text-gray-700 mb-1.5">
                Name *
              </Text>
              <TextInput
                value={subName}
                onChangeText={setSubName}
                placeholder="e.g. Rent, Recharge"
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-5"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                onPress={handleSaveSub}
                disabled={subSaving}
                className={`rounded-2xl py-4 items-center ${subSaving ? "bg-blue-300" : "bg-blue-600"}`}
              >
                <Text className="text-white font-bold text-base">
                  {subSaving ? "Saving..." : "Add Subcategory"}
                </Text>
              </TouchableOpacity>
              <View className="h-4" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
