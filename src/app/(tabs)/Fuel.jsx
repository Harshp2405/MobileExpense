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
    Platform,
    KeyboardAvoidingView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useState, useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import {
    getFuelLogs,
    addFuelLog,
    deleteFuelLog,
    calculateFuelAverage,
    updateFuelLogEndReading,
} from "../../lib/db/queries";

const Fuel = () => {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === "dark";
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);

    const [startKm, setStartKm] = useState("");
    const [endKm, setEndKm] = useState("");
    const [editingLog, setEditingLog] = useState(null);
    const [editEndKm, setEditEndKm] = useState("");
    const [litres, setLitres] = useState("");
    const [pricePerLitre, setPricePerLitre] = useState("");
    const [note, setNote] = useState("");

    // Live calculations for form preview
    const kmDriven =
        startKm && endKm ? parseFloat(endKm) - parseFloat(startKm) : 0;
    const currentAvg =
        kmDriven > 0 && litres ? (kmDriven / parseFloat(litres)).toFixed(1) : null;

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await getFuelLogs();
            setLogs(data || []);
        } catch (e) {
            console.error("Failed to load fuel logs", e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, []),
    );

    const stats = calculateFuelAverage(logs);

    const handleSave = async () => {
        if (!startKm.trim() || !litres.trim() || !pricePerLitre.trim()) {
            Alert.alert("Error", "Start km, Litres, and Price are required");
            return;
        }
        const s = parseFloat(startKm);
        const e = endKm.trim() ? parseFloat(endKm) : null;
        if (e !== null && e <= s) {
            Alert.alert("Error", "End km must be greater than Start km");
            return;
        }
        try {
            setSaving(true);
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, "0");
            const mm = String(today.getMonth() + 1).padStart(2, "0");
            const yyyy = today.getFullYear();
            await addFuelLog({
                odometerKm: e,
                startKm: s,
                litres: parseFloat(litres),
                pricePerLitre: parseFloat(pricePerLitre),
                date: `${dd}/${mm}/${yyyy}`,
                month: `${yyyy}-${mm}`,
                note: note.trim(),
            });
            setStartKm("");
            setEndKm("");
            setLitres("");
            setPricePerLitre("");
            setNote("");
            setModalVisible(false);
            await loadData();
        } catch (e) {
            Alert.alert("Error", "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateEnd = async () => {
        if (!editEndKm.trim()) {
            Alert.alert("Error", "Enter end km reading");
            return;
        }
        const endVal = parseFloat(editEndKm);
        if (endVal <= editingLog.startKm) {
            Alert.alert("Error", "End km must be greater than Start km");
            return;
        }
        await updateFuelLogEndReading(editingLog.id, endVal);
        setEditingLog(null);
        setEditEndKm("");
        await loadData();
    };

    const swipeableRefs = useRef({});

    const renderRightActions = (id) => (
        <TouchableOpacity
            onPress={() => handleDelete(id)}
            className="bg-red-500 justify-center items-center w-20 rounded-2xl mb-3"
        >
            <Ionicons name="trash-outline" size={22} color="white" />
            <Text className="text-white text-xs font-bold mt-1">Delete</Text>
        </TouchableOpacity>
    );

    const handleDelete = (id) => {
        swipeableRefs.current[id]?.close();
        if (Platform.OS === "web") {
            if (window.confirm("Delete this fuel log?")) {
                deleteFuelLog(id).then(() => loadData());
            }
        } else {
            Alert.alert("Delete", "Are you sure?", [
                { text: "Cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await deleteFuelLog(id);
                        await loadData();
                    },
                },
            ]);
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
                    data={logs}
                    contentContainerClassName="p-5"
                    ListHeaderComponent={
                        <View>
                            <View className="flex-row justify-between items-center mb-4">
                                <Text className="text-2xl font-black text-gray-900 dark:text-gray-100">
                                    Fuel Tracker
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setModalVisible(true)}
                                    className="bg-blue-600 w-10 h-10 rounded-full items-center justify-center"
                                >
                                    <Ionicons name="add" size={22} color="white" />
                                </TouchableOpacity>
                            </View>

                            {/* Stats Card */}
                            {stats ? (
                                <View className="bg-white dark:bg-zinc-800 p-5 rounded-3xl border border-gray-100 dark:border-zinc-700 mb-6">
                                    <View className="flex-row justify-between mb-3">
                                        <View className="items-center flex-1">
                                            <Text className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">
                                                Average
                                            </Text>
                                            <Text className="text-2xl font-black text-green-500">
                                                {stats.averageKmPerLitre.toFixed(1)}
                                            </Text>
                                            <Text className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                                                km/L
                                            </Text>
                                        </View>
                                        <View className="items-center flex-1">
                                            <Text className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">
                                                Cost/km
                                            </Text>
                                            <Text className="text-2xl font-black text-blue-500">
                                                ₹{stats.costPerKm.toFixed(1)}
                                            </Text>
                                            <Text className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                                                per km
                                            </Text>
                                        </View>
                                    </View>
                                    <View className="flex-row justify-between">
                                        <View className="items-center flex-1">
                                            <Text className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">
                                                Total Km
                                            </Text>
                                            <Text className="text-lg font-black text-gray-900 dark:text-gray-100">
                                                {stats.totalKm.toFixed(0)}
                                            </Text>
                                        </View>
                                        <View className="items-center flex-1">
                                            <Text className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">
                                                Total Litres
                                            </Text>
                                            <Text className="text-lg font-black text-gray-900 dark:text-gray-100">
                                                {stats.totalLitres.toFixed(1)}L
                                            </Text>
                                        </View>
                                        <View className="items-center flex-1">
                                            <Text className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">
                                                Total Spent
                                            </Text>
                                            <Text className="text-lg font-black text-gray-900 dark:text-gray-100">
                                                ₹{stats.totalCost.toFixed(0)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <View className="bg-white dark:bg-zinc-800 p-5 rounded-3xl border border-gray-100 dark:border-zinc-700 mb-6 items-center">
                                    <Text className="text-gray-400 dark:text-gray-500 text-sm">
                                        Add at least 2 fill-ups to see average
                                    </Text>
                                </View>
                            )}

                            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
                                Fill-up History
                            </Text>
                        </View>
                    }
                    ListEmptyComponent={
                        <View className="items-center py-16">
                            <Ionicons
                                name="speedometer-outline"
                                size={64}
                                color={isDark ? "#4B5563" : "#D1D5DB"}
                            />
                            <Text className="text-gray-400 dark:text-gray-500 mt-4">
                                No fill-ups recorded yet
                            </Text>
                        </View>
                    }
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => {
                        const isPending = item.odometerKm == null;
                        const driven =
                            !isPending && item.startKm ? item.odometerKm - item.startKm : 0;
                        const mileage =
                            driven > 0 && item.litres ? driven / item.litres : null;
                        return (
                            <Swipeable
                                renderRightActions={() => renderRightActions(item.id)}
                                ref={(ref) => {
                                    swipeableRefs.current[item.id] = ref;
                                }}
                            >
                                <TouchableOpacity
                                    onPress={() => {
                                        if (isPending) {
                                            setEditingLog(item);
                                            setEditEndKm("");
                                        }
                                    }}
                                    onLongPress={() => handleDelete(item.id)}
                                    className="bg-white dark:bg-zinc-800 p-4 rounded-2xl mb-3 border border-gray-100 dark:border-zinc-700"
                                >
                                    <View className="flex-row justify-between items-start">
                                        <View className="flex-1">
                                            <View className="flex-row items-center">
                                                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                                                    {item.startKm?.toFixed(0) || "?"} →{" "}
                                                    {isPending ? "?" : item.odometerKm.toFixed(0)} km
                                                </Text>
                                                {isPending && (
                                                    <View className="bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full ml-2">
                                                        <Text className="text-xs font-bold text-orange-600 dark:text-orange-400">
                                                            Pending
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                {driven > 0 ? `${driven.toFixed(0)} km • ` : ""}
                                                {item.litres}L × ₹{item.pricePerLitre}/L • {item.date}
                                            </Text>
                                            {item.note ? (
                                                <Text className="text-xs text-gray-400 mt-0.5">
                                                    {item.note}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <View className="items-end">
                                            <Text className="text-base font-black text-gray-900 dark:text-gray-100">
                                                ₹{item.totalCost.toFixed(0)}
                                            </Text>
                                            {mileage && (
                                                <Text
                                                    className={`text-xs font-bold mt-0.5 ${mileage >= 40 ? "text-green-500" : mileage >= 30 ? "text-blue-500" : "text-orange-500"}`}
                                                >
                                                    {mileage.toFixed(1)} km/L
                                                </Text>
                                            )}
                                            {isPending && (
                                                <Text className="text-xs text-blue-500 font-semibold mt-0.5">
                                                    Tap to add end km
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </Swipeable>
                        );
                    }}
                />
            )}

            {/* Add Fill-up Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
                    <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                Add Fill-up
                            </Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={isDark ? "#9CA3AF" : "#6B7280"}
                                />
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                Start Reading (km) *
                            </Text>
                            <TextInput
                                value={startKm}
                                onChangeText={setStartKm}
                                placeholder="e.g. 12000"
                                keyboardType="numeric"
                                className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                            />

                            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                End Reading (km) — optional
                            </Text>
                            <TextInput
                                value={endKm}
                                onChangeText={setEndKm}
                                placeholder="e.g. 12150"
                                keyboardType="numeric"
                                className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-2"
                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                            />

                            {/* Live km driven preview */}
                            {kmDriven > 0 && (
                                <Text className="text-xs font-bold text-blue-500 mb-4">
                                    Distance: {kmDriven.toFixed(0)} km
                                </Text>
                            )}
                            {kmDriven > 0 || <View className="mb-2" />}

                            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                Litres Filled *
                            </Text>
                            <TextInput
                                value={litres}
                                onChangeText={setLitres}
                                placeholder="e.g. 3.5"
                                keyboardType="numeric"
                                className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                            />

                            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                Price per Litre (₹) *
                            </Text>
                            <TextInput
                                value={pricePerLitre}
                                onChangeText={setPricePerLitre}
                                placeholder="e.g. 104.50"
                                keyboardType="numeric"
                                className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                            />

                            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                Note (optional)
                            </Text>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="e.g. Shell pump"
                                className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                            />

                            {/* Live average preview */}
                            {currentAvg && (
                                <View className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl mb-4 flex-row justify-between items-center">
                                    <Text className="text-sm font-bold text-green-700 dark:text-green-400">
                                        Average Preview
                                    </Text>
                                    <Text className="text-lg font-black text-green-600 dark:text-green-400">
                                        {currentAvg} km/L
                                    </Text>
                                </View>
                            )}

                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={saving}
                                className={`rounded-2xl py-4 items-center ${saving ? "bg-blue-300" : "bg-blue-600"}`}
                            >
                                <Text className="text-white font-bold text-base">
                                    {saving ? "Saving..." : "Save Fill-up"}
                                </Text>
                            </TouchableOpacity>
                            <View className="h-8" />
                        </ScrollView>
                    </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Edit End Reading Modal */}
            <Modal visible={!!editingLog} animationType="slide" transparent>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
                    <View className="bg-white dark:bg-zinc-800 rounded-t-3xl p-6">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                Add End Reading
                            </Text>
                            <TouchableOpacity onPress={() => setEditingLog(null)}>
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={isDark ? "#9CA3AF" : "#6B7280"}
                                />
                            </TouchableOpacity>
                        </View>
                        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Start: {editingLog?.startKm?.toFixed(0)} km •{" "}
                            {editingLog?.litres}L • {editingLog?.date}
                        </Text>
                        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                            End Reading (km)
                        </Text>
                        <TextInput
                            value={editEndKm}
                            onChangeText={setEditEndKm}
                            placeholder={`Must be > ${editingLog?.startKm?.toFixed(0) || "?"}`}
                            keyboardType="numeric"
                            className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-gray-100 mb-4"
                            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                            autoFocus
                        />
                        <TouchableOpacity
                            onPress={handleUpdateEnd}
                            className="bg-blue-600 rounded-2xl py-4 items-center"
                        >
                            <Text className="text-white font-bold text-base">
                                Save End Reading
                            </Text>
                        </TouchableOpacity>
                        <View className="h-8" />
                    </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};

export default Fuel;
