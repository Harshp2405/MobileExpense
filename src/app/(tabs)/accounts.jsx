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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  getAccountsWithBalances,
  addAccount,
  deleteAccount,
  addTransfer,
  getAllIncome,
  addIncome,
  updateIncome,
  deleteIncome,
} from "../../lib/db/queries";

const ACCOUNT_TYPES = ["Cash", "Bank", "Card", "UPI", "Wallet"];

const COLORS = [
  "#2563EB",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#8B5CF6",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
];

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState([]);
  const [incomeEntries, setIncomeEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState(ACCOUNT_TYPES[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [initialBalance, setInitialBalance] = useState("");

  const [transferVisible, setTransferVisible] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [fromAccountId, setFromAccountId] = useState(null);
  const [toAccountId, setToAccountId] = useState(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const [incomeVisible, setIncomeVisible] = useState(false);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [incomeTitle, setIncomeTitle] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  const [incomeDate, setIncomeDate] = useState("");
  const [incomeDescription, setIncomeDescription] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [data, incomes] = await Promise.all([
        getAccountsWithBalances(),
        getAllIncome(),
      ]);
      setAccounts(data || []);
      setIncomeEntries(incomes || []);
    } catch (error) {
      console.error("Failed to load accounts", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  const combinedBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  const formatDate = (date = new Date()) =>
    `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

  const normalizeIncomeDate = (value) => {
    const isoDate = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return isoDate ? `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}` : value || formatDate();
  };

  const resetForm = () => {
    setName("");
    setType(ACCOUNT_TYPES[0]);
    setColor(COLORS[0]);
    setInitialBalance("");
  };

  const resetIncomeForm = () => {
    setEditingIncomeId(null);
    setIncomeTitle("");
    setIncomeAmount("");
    setIncomeSource("");
    setIncomeDate(formatDate());
    setIncomeDescription("");
    setIncomeAccountId(accounts[0]?.id ?? null);
  };

  const openIncomeForm = (entry = null) => {
    if (entry) {
      setEditingIncomeId(entry.id);
      setIncomeTitle(entry.title || "");
      setIncomeAmount(String(entry.amount ?? ""));
      setIncomeSource(entry.source || "");
      setIncomeDate(normalizeIncomeDate(entry.date));
      setIncomeDescription(entry.description || "");
      setIncomeAccountId(entry.accountId ?? accounts[0]?.id ?? null);
    } else {
      resetIncomeForm();
    }
    setIncomeVisible(true);
  };

  const handleSaveIncome = async () => {
    if (incomeSaving) return;
    const numericAmount = Number(incomeAmount);
    const dateMatch = incomeDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!incomeTitle.trim()) {
      Alert.alert("Error", "Income title is required");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert("Error", "Amount must be greater than zero");
      return;
    }
    if (!dateMatch) {
      Alert.alert("Error", "Enter the date in DD/MM/YYYY format");
      return;
    }
    const [, dayText, monthText, yearText] = dateMatch;
    const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
    if (
      date.getFullYear() !== Number(yearText) ||
      date.getMonth() !== Number(monthText) - 1 ||
      date.getDate() !== Number(dayText)
    ) {
      Alert.alert("Error", "Enter a valid date");
      return;
    }
    if (!incomeAccountId) {
      Alert.alert("Error", "Select an account for this income");
      return;
    }

    try {
      setIncomeSaving(true);
      const incomeData = {
        title: incomeTitle.trim(),
        amount: numericAmount,
        source: incomeSource.trim() || "Other",
        date: incomeDate.trim(),
        description: incomeDescription.trim(),
        month: `${yearText}-${monthText}`,
        method: accounts.find((account) => account.id === incomeAccountId)?.type || "Cash",
        accountId: incomeAccountId,
      };
      if (editingIncomeId != null) {
        await updateIncome(editingIncomeId, incomeData);
      } else {
        await addIncome(incomeData);
      }
      setIncomeVisible(false);
      resetIncomeForm();
      await loadData();
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to save income");
    } finally {
      setIncomeSaving(false);
    }
  };

  const handleDeleteIncome = (entry) => {
    const confirmDelete = async () => {
      try {
        await deleteIncome(entry.id);
        await loadData();
      } catch (error) {
        Alert.alert("Error", error.message || "Failed to delete income");
      }
    };
    const message = `Delete "${entry.title}" income?`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) confirmDelete();
      return;
    }
    Alert.alert("Delete Income", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: confirmDelete },
    ]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Account name is required");
      return;
    }
    try {
      setSaving(true);
      await addAccount({
        name: name.trim(),
        type,
        color,
        initialBalance: parseFloat(initialBalance) || 0,
      });
      resetForm();
      setModalVisible(false);
      await loadData();
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, accountName) => {
    const message = `Delete "${accountName}"? Expenses and income using it will become unassigned.`;
    const runDelete = async () => {
      try {
        await deleteAccount(id);
        await loadData();
      } catch (error) {
        Alert.alert("Error", "Failed to delete account");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) runDelete();
      return;
    }
    Alert.alert("Delete Account", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: runDelete },
    ]);
  };

  const openTransferModal = () => {
    if (accounts.length < 2) {
      Alert.alert("Add More Accounts", "You need at least 2 accounts to transfer money.");
      return;
    }
    setFromAccountId(accounts[0].id);
    setToAccountId(accounts[1].id);
    setTransferAmount("");
    setTransferNote("");
    setTransferVisible(true);
  };

  const handleTransfer = async () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();

    try {
      setTransferSaving(true);
      await addTransfer({
        fromAccountId,
        toAccountId,
        amount: parseFloat(transferAmount),
        date: `${dd}/${mm}/${yyyy}`,
        month: `${yyyy}-${mm}`,
        note: transferNote.trim(),
      });
      setTransferVisible(false);
      await loadData();
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to transfer");
    } finally {
      setTransferSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList

          data={accounts}
          contentContainerClassName="p-5"
          ListHeaderComponent={
            <View>
              <View className="flex-row justify-between items-center mb-6 mt-2">
                <Text className="text-3xl font-black text-gray-900 dark:text-gray-100">
                  Accounts
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => openIncomeForm()}
                    className="bg-green-600 h-10 px-3 rounded-full flex-row items-center justify-center shadow-sm"
                  >
                    <Ionicons name="arrow-down" size={18} color="white" />
                    <Text className="text-white font-semibold ml-1">Income</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openTransferModal}
                    className="bg-gray-100 dark:bg-zinc-800 w-10 h-10 rounded-full items-center justify-center border border-gray-200 dark:border-zinc-700"
                  >
                    <Ionicons name="swap-horizontal" size={20} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setModalVisible(true)}
                    className="bg-blue-600 w-10 h-10 rounded-full items-center justify-center shadow-sm"
                  >
                    <Ionicons name="add" size={24} color="white" />
                  </TouchableOpacity>
                </View>
              </View>

              <View className="bg-white dark:bg-zinc-800 rounded-2xl p-5 mb-6 shadow-sm border border-gray-100 dark:border-zinc-700">
                <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Combined Balance
                </Text>
                <Text className="text-3xl font-black text-gray-900 dark:text-gray-100">
                  ₹{combinedBalance.toFixed(2)}
                </Text>
              </View>
            </View>
          }
          ListFooterComponent={
            <View className="mt-2">
              <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                Income History
              </Text>
              {incomeEntries.length === 0 ? (
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  No income recorded yet.
                </Text>
              ) : (
                incomeEntries.map((entry) => {
                  const accountName =
                    accounts.find((account) => account.id === entry.accountId)?.name ||
                    "Unassigned";
                  return (
                    <View
                      key={entry.id}
                      className="bg-white dark:bg-zinc-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-zinc-700 flex-row items-center"
                    >
                      <View className="flex-1 mr-2">
                        <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                          {entry.title}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {entry.source || "Income"} · {accountName} · {entry.date}
                        </Text>
                      </View>
                      <Text className="text-base font-bold text-green-600 mr-2">
                        +₹{Number(entry.amount || 0).toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => openIncomeForm(entry)}
                        accessibilityLabel={`Edit ${entry.title} income`}
                        className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center mr-1"
                      >
                        <Ionicons name="create-outline" size={17} color="#2563EB" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteIncome(entry)}
                        accessibilityLabel={`Delete ${entry.title} income`}
                        className="w-9 h-9 rounded-full bg-red-50 dark:bg-red-900/30 items-center justify-center"
                      >
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 w-full">
              <Ionicons name="wallet-outline" size={64} color="#D1D5DB" />
              <Text className="text-gray-400 dark:text-gray-500 mt-4 text-base font-medium">
                No accounts added
              </Text>
            </View>
          }
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View className="bg-white dark:bg-zinc-800 rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-zinc-700 flex-row items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: `${item.color || "#2563EB"}20` }}
              >
                <Ionicons name="wallet" size={22} color={item.color || "#2563EB"} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {item.name}
                </Text>
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {item.type}
                </Text>
              </View>
              <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 mr-3">
                ₹{item.balance.toFixed(2)}
              </Text>
              <TouchableOpacity
                onPress={() => handleDelete(item.id, item.name)}
                className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 items-center justify-center"
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal  visible={incomeVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
            <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6 max-h-[85%]">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editingIncomeId != null ? "Edit Income" : "Add Income"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setIncomeVisible(false);
                    resetIncomeForm();
                  }}
                  accessibilityLabel="Close income form"
                >
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Title *
                </Text>
                <TextInput
                  value={incomeTitle}
                  onChangeText={setIncomeTitle}
                  placeholder="e.g. Monthly salary"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                />

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Amount *
                </Text>
                <TextInput
                  value={incomeAmount}
                  onChangeText={setIncomeAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                />

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Deposit to *
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2">
                    {accounts.map((account) => (
                      <TouchableOpacity
                        key={account.id}
                        onPress={() => setIncomeAccountId(account.id)}
                        className={`px-4 py-2 rounded-full border ${incomeAccountId === account.id ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600"}`}
                      >
                        <Text
                          className={`text-sm font-semibold ${incomeAccountId === account.id ? "text-white" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          {account.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Source
                </Text>
                <TextInput
                  value={incomeSource}
                  onChangeText={setIncomeSource}
                  placeholder="e.g. Salary, freelance"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                />

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Date (DD/MM/YYYY)
                </Text>
                <TextInput
                  value={incomeDate}
                  onChangeText={setIncomeDate}
                  placeholder="DD/MM/YYYY"
                  keyboardType="numeric"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                />

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Description
                </Text>
                <TextInput
                  value={incomeDescription}
                  onChangeText={setIncomeDescription}
                  placeholder="Optional note"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-6"
                />

                <TouchableOpacity
                  onPress={handleSaveIncome}
                  disabled={incomeSaving}
                  className={`rounded-2xl py-4 items-center ${incomeSaving ? "bg-green-300" : "bg-green-600"}`}
                >
                  <Text className="text-white font-bold text-base">
                    {incomeSaving
                      ? "Saving..."
                      : editingIncomeId != null
                        ? "Update Income"
                        : "Save Income"}
                  </Text>
                </TouchableOpacity>
                <View className="h-8" />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Account Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
            <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6 max-h-[85%]">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Add Account
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

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Name *
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. HDFC Bank"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                  placeholderTextColor="#9CA3AF"
                />

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Type
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2">
                    {ACCOUNT_TYPES.map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setType(t)}
                        className={`px-4 py-2 rounded-full border ${type === t ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600"}`}
                      >
                        <Text
                          className={`text-sm font-semibold ${type === t ? "text-white" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Color
                </Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setColor(c)}
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: c }}
                    >
                      {color === c && <Ionicons name="checkmark" size={18} color="white" />}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Initial Balance
                </Text>
                <TextInput
                  value={initialBalance}
                  onChangeText={setInitialBalance}
                  placeholder="0.00"
                  keyboardType="numeric"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-6"
                  placeholderTextColor="#9CA3AF"
                />

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  className={`rounded-2xl py-4 items-center ${saving ? "bg-blue-300" : "bg-blue-600"}`}
                >
                  <Text className="text-white font-bold text-base">
                    {saving ? "Saving..." : "Add Account"}
                  </Text>
                </TouchableOpacity>
                <View className="h-8" />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Transfer Modal */}
      <Modal visible={transferVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
            <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6 max-h-[85%]">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Transfer Money
                </Text>
                <TouchableOpacity onPress={() => setTransferVisible(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  From
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2">
                    {accounts.map((acct) => (
                      <TouchableOpacity
                        key={acct.id}
                        onPress={() => {
                          setFromAccountId(acct.id);
                          if (toAccountId === acct.id) {
                            const fallback = accounts.find((a) => a.id !== acct.id);
                            setToAccountId(fallback ? fallback.id : null);
                          }
                        }}
                        className={`px-4 py-2 rounded-full border ${fromAccountId === acct.id ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600"}`}
                      >
                        <Text
                          className={`text-sm font-semibold ${fromAccountId === acct.id ? "text-white" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          {acct.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  To
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2">
                    {accounts
                      .filter((acct) => acct.id !== fromAccountId)
                      .map((acct) => (
                        <TouchableOpacity
                          key={acct.id}
                          onPress={() => setToAccountId(acct.id)}
                          className={`px-4 py-2 rounded-full border ${toAccountId === acct.id ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600"}`}
                        >
                          <Text
                            className={`text-sm font-semibold ${toAccountId === acct.id ? "text-white" : "text-gray-700 dark:text-gray-300"}`}
                          >
                            {acct.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                </ScrollView>

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Amount *
                </Text>
                <TextInput
                  value={transferAmount}
                  onChangeText={setTransferAmount}
                  placeholder="0.00"
                  keyboardType="numeric"
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                  placeholderTextColor="#9CA3AF"
                />

                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Note
                </Text>
                <TextInput
                  value={transferNote}
                  onChangeText={setTransferNote}
                  placeholder="Optional note..."
                  className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-6"
                  placeholderTextColor="#9CA3AF"
                />

                <TouchableOpacity
                  onPress={handleTransfer}
                  disabled={transferSaving || !transferAmount || fromAccountId === toAccountId}
                  className={`rounded-2xl py-4 items-center ${transferSaving || !transferAmount || fromAccountId === toAccountId ? "bg-blue-300" : "bg-blue-600"}`}
                >
                  <Text className="text-white font-bold text-base">
                    {transferSaving ? "Transferring..." : "Transfer"}
                  </Text>
                </TouchableOpacity>
                <View className="h-8" />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
