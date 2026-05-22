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
  SectionList,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import {
  getBudgetByMonth,
  getExpensesByMonth,
  getExpenseHistory,
  saveBudget,
  getCategories,
} from "../../lib/db/queries";
import { convertToSectionList } from "@/lib/utils/helperFunctions";
import { syncAll } from "../../lib/sync/syncManager";

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

// Generate years from
// const nowYear = new Date().getFullYear();
// const YEARS = Array.from({ length: 115 }, (_, i) => nowYear - 15 + i);
const YEARS = Array.from({ length: 101 }, (_, i) => 2025 + i);

export default function BudgetsScreen() {
  const [budget, setBudget] = useState(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [spentByCategory, setSpentByCategory] = useState([]);
  const [categoryColors, setCategoryColors] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sectionDrop, setsectionDrop] = useState({});

  // Filter Selector State
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [yearPickerVisible, setYearPickerVisible] = useState(false);

  // Calculate standard 'yyyy-mm' key to match MongoDB and Web frontend
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;

  // Form state
  const [budgetAmount, setBudgetAmount] = useState("");
  const loadData = async () => {
    try {
      setLoading(true);

      // Get the single budget for this month
      const monthBudget = await getBudgetByMonth(monthKey);
      setBudget(monthBudget);

      // Get custom categories to resolve colors
      const cats = await getCategories();
      const colorMap = {};
      cats.forEach((c) => {
        if (c.name && c.color) {
          colorMap[c.name] = c.color;
        }
      });
      setCategoryColors(colorMap);

      // Trigger sync in background
      syncAll().then(async () => {
        const monthBudget = await getBudgetByMonth(monthKey);
        setBudget(monthBudget);
        const expenses = await getExpensesByMonth(monthKey);
        const total = expenses.reduce((acc, e) => acc + e.amount, 0);
        setTotalSpent(total);
      }).catch(e => console.warn("Background sync failed:", e));

      // Get all expenses to calculate total spent and breakdown by category
      const expenses = await getExpensesByMonth(monthKey);
      const total = expenses.reduce((acc, e) => acc + e.amount, 0);
      setTotalSpent(total);

      // Group by category for breakdown with transaction counts
      const catMap = {};
      expenses.forEach((e) => {
        const cat = e.category || "General";
        if (!catMap[cat]) {
          catMap[cat] = { amount: 0, count: 0 };
        }
        catMap[cat].amount += e.amount;
        catMap[cat].count += 1;
      });
      const breakdown = Object.entries(catMap)
        .map(([name, data]) => ({
          name,
          amount: data.amount,
          count: data.count,
        }))
        .sort((a, b) => b.amount - a.amount);
      setSpentByCategory(breakdown);
    } catch (error) {
      console.error("Failed to load budgets", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [monthKey]),
  );

  const [first, setfirst] = useState([]);
  const [Second, setSecond] = useState([]);

  const fetchExpenses = async () => {
    try {
      const expenses = await getExpensesByMonth(monthKey);
      const sectionData = convertToSectionList(expenses, "category");
      setfirst(sectionData);
    } catch (error) {
      console.log(error);
    }
  };
  const fetchExpensesDrop = async () => {
    try {
      const expenses = await getExpensesByMonth(monthKey);

      setSecond(expenses);
    } catch (error) {
      console.log(error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
      fetchExpensesDrop();
    }, [monthKey]),
  );

  const openModal = () => {
    setBudgetAmount(budget ? String(budget.amount) : "");
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!budgetAmount.trim()) {
      Alert.alert("Error", "Budget amount is required");
      return;
    }
    try {
      setSaving(true);
      await saveBudget({
        month: monthKey,
        amount: parseFloat(budgetAmount),
      });
      setModalVisible(false);
      await loadData();
    } catch (error) {
      console.error("Budget save error:", error);
      Alert.alert("Error", error?.message || "Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  const budgetLimit = budget ? budget.amount : 0;
  const progress =
    budgetLimit > 0 ? Math.min((totalSpent / budgetLimit) * 100, 100) : 0;
  const remaining = budgetLimit - totalSpent;
  const isOver = remaining < 0;
  const isNearLimit = progress > 80;

  return (
    <SafeAreaView className='flex-1 bg-gray-50'>
      {loading ?
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator size='large' color='#2563EB' />
        </View>
      : <ScrollView contentContainerClassName='p-5'>
          {/* Year and Month Pickers */}
          <View className='flex-row gap-3 mb-6'>
            <TouchableOpacity
              onPress={() => setMonthPickerVisible(true)}
              className='flex-1 bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex-row justify-between items-center shadow-sm'>
              <Text className='text-gray-800 text-sm font-semibold'>
                {MONTHS[selectedMonth]}
              </Text>
              <Ionicons name='chevron-down' size={18} color='#9CA3AF' />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setYearPickerVisible(true)}
              className='flex-1 bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex-row justify-between items-center shadow-sm'>
              <Text className='text-gray-800 text-sm font-semibold'>
                {selectedYear}
              </Text>
              <Ionicons name='chevron-down' size={18} color='#9CA3AF' />
            </TouchableOpacity>
          </View>

          <View className='flex-row justify-between items-center mb-6'>
            <Text className='text-3xl font-black text-gray-900'>
              {MONTHS[selectedMonth]} {selectedYear}
            </Text>
            <TouchableOpacity
              onPress={openModal}
              className='bg-blue-600 px-4 py-2.5 rounded-full flex-row items-center gap-1.5'>
              <Ionicons
                name={budget ? "create-outline" : "add"}
                size={18}
                color='white'
              />
              <Text className='text-white font-bold text-sm'>
                {budget ? "Edit" : "Set"} Budget
              </Text>
            </TouchableOpacity>
          </View>

          {/* Budget Overview Card */}
          <View className='bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6'>
            {budget ?
              <View>
                <View className='flex-row justify-between items-end mb-4'>
                  <View>
                    <Text className='text-xs font-medium text-gray-400 uppercase tracking-wider mb-1'>
                      Budget
                    </Text>
                    <Text className='text-3xl font-black text-gray-900'>
                      ${budgetLimit.toFixed(2)}
                    </Text>
                  </View>
                  <View className='items-end'>
                    <Text className='text-xs font-medium text-gray-400 uppercase tracking-wider mb-1'>
                      {isOver ? "Over by" : "Remaining"}
                    </Text>
                    <Text
                      className={`text-2xl font-black ${isOver ? "text-red-500" : "text-green-500"}`}>
                      ${Math.abs(remaining).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View className='h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-3'>
                  <View
                    className={`h-full rounded-full ${
                      isOver ? "bg-red-500"
                      : isNearLimit ? "bg-amber-500"
                      : "bg-green-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </View>

                <View className='flex-row justify-between'>
                  <Text className='text-xs text-gray-400 font-medium'>
                    Spent: ${totalSpent.toFixed(2)}
                  </Text>
                  <Text className='text-xs text-gray-400 font-medium'>
                    {progress.toFixed(0)}% used
                  </Text>
                </View>
              </View>
            : <View className='items-center py-6'>
                <Ionicons name='wallet-outline' size={48} color='#D1D5DB' />
                <Text className='text-gray-400 mt-3 text-base font-medium'>
                  No budget set for {MONTHS[selectedMonth]} {selectedYear}
                </Text>
                <TouchableOpacity
                  onPress={openModal}
                  className='mt-3 bg-blue-600 px-5 py-2.5 rounded-full'>
                  <Text className='text-white font-bold text-sm'>
                    Set Budget
                  </Text>
                </TouchableOpacity>
              </View>
            }
          </View>

          {/* Spending Breakdown */}
          {spentByCategory.length > 0 && (
            <View className='mt-2 mb-8'>
              <Text className='text-xl font-black text-gray-900 mb-4'>
                Spending Breakdown
              </Text>

              {spentByCategory.map((cat) => {
                const catProgress =
                  budgetLimit > 0 ? (cat.amount / budgetLimit) * 100 : 0;
                const pctOfTotal =
                  totalSpent > 0 ? (cat.amount / totalSpent) * 100 : 0;
                const color = categoryColors[cat.name] || "#3B82F6";

                return (
                  <View
                    key={cat.name}
                    className='bg-white p-5 rounded-3xl mb-4 shadow-sm border border-gray-100/80'>
                    <View className='flex-row justify-between items-start mb-3'>
                      <View className='flex-1 pr-4'>
                        <View className='flex-row items-center gap-2'>
                          <View
                            className='w-3 h-3 rounded-full'
                            style={{ backgroundColor: color }}
                          />
                          <Text className='text-base font-black text-gray-900'>
                            {cat.name}
                          </Text>
                        </View>
                        <Text className='text-xs text-gray-400 font-semibold mt-1'>
                          {cat.count}{" "}
                          {cat.count === 1 ? "transaction" : "transactions"} •{" "}
                          {pctOfTotal.toFixed(0)}% of total spent
                        </Text>
                      </View>
                      <Text className='text-lg font-black text-gray-900'>
                        ${cat.amount.toFixed(2)}
                      </Text>
                    </View>

                    {/* Progress Bar */}
                    <View className='h-2.5 w-full bg-gray-100 rounded-full overflow-hidden'>
                      <View
                        className='h-full rounded-full'
                        style={{
                          width: `${Math.min(catProgress, 100)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </View>

                    {/* Progress percentage details if budget exists */}
                    {budgetLimit > 0 && (
                      <View className='flex-row justify-between mt-2'>
                        <Text className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider'>
                          Budget Share:{" "}
                          {((cat.amount / budgetLimit) * 100).toFixed(0)}%
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          <View>
            <Text>SectionList</Text>
            {/* SectionList */}
            <SectionList
              className=''
              sections={first}
              keyExtractor={(item, index) => item.id ?? String(index)}
              renderItem={({ item, section }) => {
                if (!sectionDrop[section.title]) {
                  return null;
                }
                return (
                  <>
                    <View
                      activeOpacity={0.85}
                      className='bg-white px-4 py-4 rounded-3xl mb-2 border border-gray-100 flex-row items-center justify-between shadow-sm'>
                      {/* Left Content */}
                      <View className='flex-row items-center flex-1'>
                        {/* Icon */}
                        <View className='w-14 h-14 bg-blue-50 rounded-2xl items-center justify-center mr-4'>
                          <Ionicons
                            name='clipboard-outline'
                            size={26}
                            color='#2563EB'
                          />
                        </View>

                        {/* Text */}
                        <View className='flex-1'>
                          <Text
                            numberOfLines={1}
                            className='text-[15px] font-extrabold text-gray-900'>
                            {item.title}
                          </Text>

                          <View className='flex-row items-center mt-1'>
                            <Ionicons
                              name='calendar-outline'
                              size={12}
                              color='#9CA3AF'
                            />

                            <Text className='text-xs font-medium text-gray-500 ml-1'>
                              {item.date}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Amount */}
                      <View className='items-end ml-3'>
                        <Text className='text-[17px] font-black text-gray-900'>
                          ${item.amount.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </>
                );
              }}
              renderSectionHeader={({ section }) => (
                <Pressable
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.5 : 1,
                    backgroundColor: pressed ? "#e60b0bff" : "#14a14aff",
                  })}
                  onPress={() => {
                    setsectionDrop((prev) => ({
                      ...prev,
                      [section.title]: !prev[section.title],
                    }));
                  }}
                  className='p-5 rounded-3xl mb-3 shadow-sm border border-gray-100/80'
                  >
                  <View className='flex-row justify-between items-start'>
                    <View className='flex-1 pr-4'>
                      <View className='flex-row items-center gap-2'>
                        <View
                          className='w-3 h-3 rounded-full'
                          style={{ backgroundColor: "#14B8A6" }}
                        />
                        <Text className='text-base font-black text-gray-900'>
                          {section.title}
                        </Text>
                      </View>
                    </View>
                    <View className='flex-row items-center mt-1'>
                      {sectionDrop[section.title] ?
                        <Ionicons name='chevron-up' size={12} color='#9CA3AF' />
                      : <Ionicons
                          name='chevron-down'
                          size={12}
                          color='#9CA3AF'
                        />
                      }
                    </View>
                  </View>
                </Pressable>
              )}></SectionList>

            {/* Simple DropDown */}
          </View>
        </ScrollView>
      }

      {/* Set/Edit Budget Modal */}
      <Modal visible={modalVisible} animationType='slide' transparent>
        <View className='flex-1 justify-end bg-black/40'>
          <View className='bg-white rounded-t-3xl p-6'>
            <View className='flex-row justify-between items-center mb-6'>
              <Text className='text-xl font-bold text-gray-900'>
                {budget ? "Edit" : "Set"} Budget for {MONTHS[selectedMonth]}{" "}
                {selectedYear}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name='close' size={24} color='#6B7280' />
              </TouchableOpacity>
            </View>

            <Text className='text-sm font-semibold text-gray-700 mb-1.5'>
              Monthly Budget Limit *
            </Text>
            <TextInput
              value={budgetAmount}
              onChangeText={setBudgetAmount}
              placeholder='1500.00'
              keyboardType='numeric'
              className='bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-6'
              placeholderTextColor='#9CA3AF'
              autoFocus
            />

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className={`rounded-2xl py-4 items-center ${saving ? "bg-blue-300" : "bg-blue-600"}`}>
              <Text className='text-white font-bold text-base'>
                {saving ? "Saving..." : "Save Budget"}
              </Text>
            </TouchableOpacity>

            <View className='h-4' />
          </View>
        </View>
      </Modal>

      {/* Month Picker Modal */}
      <Modal visible={monthPickerVisible} transparent animationType='fade'>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setMonthPickerVisible(false)}
          className='flex-1 justify-center items-center bg-black/40 px-6'>
          <View className='bg-white w-full max-h-[70%] rounded-3xl p-6 shadow-xl'>
            <Text className='text-lg font-bold text-gray-900 mb-4 text-center'>
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
                    className={`w-[45%] p-4 rounded-2xl items-center border ${selectedMonth === idx ? "bg-blue-600 border-blue-600" : "bg-gray-50 border-gray-100"}`}>
                    <Text
                      className={`font-semibold ${selectedMonth === idx ? "text-white" : "text-gray-700"}`}>
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
          className='flex-1 justify-center items-center bg-black/40 px-6'>
          <View className='bg-white w-full max-h-[75%] rounded-3xl p-6 shadow-xl'>
            <Text className='text-lg font-bold text-gray-900 mb-4 text-center'>
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
                  className={`p-4 rounded-xl items-center mb-2 border ${selectedYear === item ? "bg-blue-600 border-blue-600" : "bg-gray-50 border-gray-100"}`}>
                  <Text
                    className={`font-bold ${selectedYear === item ? "text-white" : "text-gray-700"}`}>
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
