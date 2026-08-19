import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  getExpensesByMonth,
  getExpenseHistory,
  addExpense,
  getCategories,
  deleteExpense,
} from "../../lib/db/queries";
import { exportToPDF } from "../../lib/utils/pdfExporter";
import { syncAll } from "../../lib/sync/syncManager";

import { useColorScheme } from "nativewind";

const METHODS = ["Cash", "Card", "UPI", "Other"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Generate years from 2010 to 2110
const YEARS = Array.from({ length: 101 }, (_, i) => 2010 + i);

export default function ExpensesScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [expenses, setExpenses] = useState([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [categoryList, setCategoryList] = useState([]);
  const [saving, setSaving] = useState(false);

  // Filter Selector State
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = useState(now.getFullYear()); // 2010-2110
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [yearPickerVisible, setYearPickerVisible] = useState(false);

  // Calculate standard 'yyyy-mm' key to match MongoDB and Web frontend
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;

  // Form state
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("Cash");
  const [description, setDescription] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Trigger sync in background
      syncAll().then(async () => {
        const data = await getExpensesByMonth(monthKey);
        setExpenses(data || []);

        const history = await getExpenseHistory();
        const currentHistory = history.find((h) => h.month === monthKey);
        setTotalSpent(currentHistory ? currentHistory.total : 0);
      }).catch(e => console.warn("Background sync failed:", e));

      // Load initial local data immediately for fast load
      const data = await getExpensesByMonth(monthKey);
      setExpenses(data || []);

      const history = await getExpenseHistory();
      const currentHistory = history.find((h) => h.month === monthKey);
      setTotalSpent(currentHistory ? currentHistory.total : 0);
    } catch (error) {
      console.error("Failed to load expenses", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [monthKey]),
  );

  const openModal = async () => {
    const cats = await getCategories();
    setCategoryList(cats || []);
    if (cats.length > 0) setCategory(cats[0].name);
    setModalVisible(true);
  };

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setCategory("");
    setMethod("Cash");
    setDescription("");
  };

  const handleSave = async () => {
    if (!title.trim() || !amount.trim()) {
      Alert.alert("Error", "Title and Amount are required");
      return;
    }
    try {
      setSaving(true);
      // Storing date in DD/MM/YYYY format as requested!
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = today.getFullYear();
      const formattedDate = `${dd}/${mm}/${yyyy}`;

      await addExpense({
        title: title.trim(),
        amount: parseFloat(amount),
        category: category || "Other",
        date: formattedDate,
        description: description.trim(),
        month: monthKey, // stores yyyy-mm to match MongoDB and Web frontend
        method,
      });
      resetForm();
      setModalVisible(false);
      await loadData();
    } catch (error) {
      Alert.alert("Error", "Failed to add expense");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (expenses.length === 0) {
      Alert.alert(
        "No Expenses",
        "There are no expenses in this month to export.",
      );
      return;
    }
    try {
      const savedPath = await exportToPDF({
        expenses,
        monthName: MONTHS[selectedMonth],
        year: selectedYear,
        totalSpent,
      });
      const filename = savedPath.split("/").pop();
      Alert.alert(
        "Download Complete",
        `Saved to local storage as:\n\n${filename}`,
      );
    } catch (e) {
      Alert.alert("Error", "Failed to export PDF report.");
    }
  };

  const handleDelete = (id) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteExpense(id);
          await loadData();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-50 dark:bg-zinc-900'>
      {loading ?
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator size='large' color='#2563EB' />
        </View>
      : <FlatList
          data={expenses}
          contentContainerClassName='p-5'
          ListHeaderComponent={
            <View>
              {/* Year and Month Pickers */}
              <View className='flex-row gap-3 mb-6'>
                <TouchableOpacity
                  onPress={() => setMonthPickerVisible(true)}
                  className='flex-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl px-4 py-3.5 flex-row justify-between items-center shadow-sm'>
                  <Text className='text-gray-800 dark:text-gray-200 text-sm font-semibold'>
                    {MONTHS[selectedMonth]}
                  </Text>
                  <Ionicons name='chevron-down' size={18} color={isDark ? '#6B7280' : '#9CA3AF'} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setYearPickerVisible(true)}
                  className='flex-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl px-4 py-3.5 flex-row justify-between items-center shadow-sm'>
                  <Text className='text-gray-800 dark:text-gray-200 text-sm font-semibold'>
                    {selectedYear}
                  </Text>
                  <Ionicons name='chevron-down' size={18} color={isDark ? '#6B7280' : '#9CA3AF'} />
                </TouchableOpacity>
              </View>

              <View className='flex-row justify-between items-center mb-8'>
                <View>
                  <Text className='text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1'>
                    Total Spent
                  </Text>
                  <Text className='text-4xl font-black text-gray-900 dark:text-gray-100'>
                    ₹{totalSpent.toFixed(2)}
                  </Text>
                </View>
                <View className='flex-row gap-2'>
                  <TouchableOpacity
                    onPress={handleExport}
                    className='bg-gray-100 dark:bg-zinc-800 w-12 h-12 rounded-full items-center justify-center border border-gray-200 dark:border-zinc-700 shadow-sm'>
                    <Ionicons name='share-outline' size={22} color={isDark ? '#9CA3AF' : '#4B5563'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openModal}
                    className='bg-blue-600 w-12 h-12 rounded-full items-center justify-center shadow-sm'>
                    <Ionicons name='add' size={24} color='white' />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className='items-center justify-center py-20'>
              <Ionicons name='receipt-outline' size={64} color={isDark ? '#4B5563' : '#D1D5DB'} />
              <Text className='text-gray-400 dark:text-gray-500 mt-4 text-base font-medium'>
                No expenses found for {MONTHS[selectedMonth]} {selectedYear}
              </Text>
            </View>
          }
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              onLongPress={() => handleDelete(item.id)}
              className='bg-white dark:bg-zinc-800 p-4 rounded-2xl mb-4 shadow-sm border border-gray-100 dark:border-zinc-700 flex-row justify-between items-center'>
              <View className='flex-row items-center flex-1'>
                <View className='w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full items-center justify-center mr-4'>
                  <Ionicons name='wallet-outline' size={24} color='#2563EB' />
                </View>
                <View>
                  <Text className='text-base font-bold text-gray-900 dark:text-gray-100 mb-0.5'>
                    {item.title}
                  </Text>
                  <Text className='text-xs font-medium text-gray-500 dark:text-gray-400'>
                    {item.method} • {item.category} • {item.date}
                  </Text>
                </View>
              </View>
              <Text className='text-lg font-bold text-gray-900 dark:text-gray-100'>
                ₹{item.amount.toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}
        />
      }

      {/* Add Expense Modal */}
      <Modal visible={modalVisible} animationType='slide' transparent>
        <View className='flex-1 justify-end bg-black/40 dark:bg-black/60'>
          <View className='bg-white dark:bg-zinc-800 rounded-t-3xl p-6 max-h-[85%]'>
            <View className='flex-row justify-between items-center mb-6'>
              <Text className='text-xl font-bold text-gray-900 dark:text-gray-100'>
                Add Expense
              </Text>
              <TouchableOpacity
                onPress={() => {
                  resetForm();
                  setModalVisible(false);
                }}>
                <Ionicons name='close' size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5'>
                Title *
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder='e.g. Groceries'
                className='bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4'
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              />

              <Text className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5'>
                Amount *
              </Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder='0.00'
                keyboardType='numeric'
                className='bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4'
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              />

              <Text className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5'>
                Category
              </Text>
              {categoryList.length > 0 ?
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className='mb-4'>
                  <View className='flex-row gap-2'>
                    {categoryList.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setCategory(cat.name)}
                        className={`px-4 py-2 rounded-full border ${category === cat.name ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600"}`}>
                        <Text
                          className={`text-sm font-semibold ${category === cat.name ? "text-white" : "text-gray-700 dark:text-gray-300"}`}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              : <Text className='text-sm text-gray-400 dark:text-gray-500 mb-4'>
                  No categories yet. Add some in the Categories tab first.
                </Text>
              }

              <Text className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5'>
                Payment Method
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className='mb-4'>
                <View className='flex-row gap-2'>
                  {METHODS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMethod(m)}
                      className={`px-4 py-2 rounded-full border ${method === m ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600"}`}>
                      <Text
                        className={`text-sm font-semibold ${method === m ? "text-white" : "text-gray-700 dark:text-gray-300"}`}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5'>
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder='Optional note...'
                multiline
                className='bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-6 min-h-[80px]'
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                textAlignVertical='top'
              />

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className={`rounded-2xl py-4 items-center ${saving ? "bg-blue-300" : "bg-blue-600"}`}>
                <Text className='text-white font-bold text-base'>
                  {saving ? "Saving..." : "Add Expense"}
                </Text>
              </TouchableOpacity>

              <View className='h-8' />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Month Picker Modal */}
      <Modal visible={monthPickerVisible} transparent animationType='fade'>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setMonthPickerVisible(false)}
          className='flex-1 justify-center items-center bg-black/40 dark:bg-black/60 px-6'>
          <View className='bg-white dark:bg-zinc-800 w-full max-h-[70%] rounded-3xl p-6 shadow-xl'>
            <Text className='text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 text-center'>
              Select Month
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className='flex-row flex-wrap gap-2 justify-center'>
                {MONTHS.map((m, idx) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => {
                      setSelectedMonth(idx);
                      setMonthPickerVisible(false);
                    }}
                    className={`w-[45%] p-4 rounded-2xl items-center border ${selectedMonth === idx ? "bg-blue-600 border-blue-600" : "bg-gray-50 dark:bg-zinc-700 border-gray-100 dark:border-zinc-600"}`}>
                    <Text
                      className={`font-semibold ${selectedMonth === idx ? "text-white" : "text-gray-700 dark:text-gray-300"}`}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Year Picker Modal */}
      <Modal visible={yearPickerVisible} transparent animationType='fade'>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setYearPickerVisible(false)}
          className='flex-1 justify-center items-center bg-black/40 dark:bg-black/60 px-6'>
          <View className='bg-white dark:bg-zinc-800 w-full max-h-[75%] rounded-3xl p-6 shadow-xl'>
            <Text className='text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 text-center'>
              Select Year
            </Text>
            <FlatList
              data={YEARS}
              keyExtractor={(item) => item.toString()}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedYear(item);
                    setYearPickerVisible(false);
                  }}
                  className={`p-4 rounded-xl items-center mb-2 border ${selectedYear === item ? "bg-blue-600 border-blue-600" : "bg-gray-50 dark:bg-zinc-700 border-gray-100 dark:border-zinc-600"}`}>
                  <Text
                    className={`font-bold ${selectedYear === item ? "text-white" : "text-gray-700 dark:text-gray-300"}`}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
