import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL } from "../lib/sync/syncManager";

export default function AboutScreen() {
  const [apiStatus, setApiStatus] = useState("unknown"); // 'unknown', 'loading', 'online', 'offline'
  const [responseTime, setResponseTime] = useState(null);

  const checkApiHealth = async () => {
    try {
      setApiStatus("loading");
      const startTime = Date.now();
      
      const res = await fetch(`${API_URL}/budget/delta`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      
      const endTime = Date.now();
      if (res.ok) {
        setApiStatus("online");
        setResponseTime(endTime - startTime);
      } else {
        setApiStatus("offline");
        setResponseTime(null);
      }
    } catch (e) {
      console.warn("[Diagnostics] Health check error:", e);
      setApiStatus("offline");
      setResponseTime(null);
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="p-6 pb-12"
      >

        <View className="bg-blue-600 rounded-3xl p-6 shadow-md mb-6 items-center">
          <View className="w-16 h-16 bg-white/20 rounded-2xl items-center justify-center mb-4">
            <Ionicons name="wallet" size={36} color="#FFFFFF" />
          </View>
          <Text className="text-white text-xl font-black tracking-wide">
            Expense Tracker Pro
          </Text>
          <Text className="text-white/80 text-xs font-bold mt-1 uppercase tracking-widest">
            v1.0.0 • Offline-First Edition
          </Text>
        </View>

        <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5 ml-1">
          Technical Architecture
        </Text>
        <View className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm mb-6">
          <View className="flex-row items-center mb-4">
            <View className="w-10 h-10 bg-emerald-50 rounded-xl items-center justify-center mr-3">
              <Ionicons name="git-branch" size={20} color="#10B981" />
            </View>
            <Text className="text-gray-800 text-base font-extrabold">
              Dual-Storage Sync Engine
            </Text>
          </View>

          <Text className="text-gray-500 text-sm leading-relaxed mb-4">
            The application operates entirely offline-first. All transactions and budgets are committed instantly to a local database, ensuring fluid responsiveness regardless of network availability.
          </Text>

          <View className="space-y-3.5 border-t border-gray-100 pt-4">
            <View className="flex-row items-start">
              <Ionicons name="phone-portrait-outline" size={16} color="#2563EB" className="mt-0.5 mr-3" />
              <View className="flex-1">
                <Text className="text-gray-800 text-xs font-bold mb-0.5">Local SQLite + Drizzle ORM</Text>
                <Text className="text-gray-400 text-[11px] leading-relaxed">
                  Highly optimized native SQLite relational database queries using type-safe Drizzle builders (with automatic fallback to JSON-simulated localStorage inside web browsers).
                </Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Ionicons name="cloud-outline" size={16} color="#2563EB" className="mt-0.5 mr-3" />
              <View className="flex-1">
                <Text className="text-gray-800 text-xs font-bold mb-0.5">MongoDB Atlas + Express Cloud Sync</Text>
                <Text className="text-gray-400 text-[11px] leading-relaxed">
                  Pushes pending records to MongoDB API clusters and pulls server-side updates dynamically since the last recorded sync token. Includes deletion reconciliation mechanics.
                </Text>
              </View>
            </View>
          </View>
        </View>


        <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5 ml-1">
          Server Health & Diagnostics
        </Text>
        <View className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm mb-6">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-gray-800 text-sm font-bold">API Endpoint</Text>
              <Text className="text-gray-400 text-xs mt-0.5">{API_URL.replace("https://", "").replace("http://", "")}</Text>
            </View>
            <TouchableOpacity
              onPress={checkApiHealth}
              disabled={apiStatus === "loading"}
              className="bg-gray-100 px-3.5 py-2 rounded-xl"
            >
              {apiStatus === "loading" ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Ionicons name="refresh" size={16} color="#2563EB" />
              )}
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center justify-between bg-gray-50 border border-gray-100 rounded-2xl p-4">
            <View className="flex-row items-center">
              <View
                className={`w-3.5 h-3.5 rounded-full mr-3 items-center justify-center ${
                  apiStatus === "online"
                    ? "bg-emerald-100"
                    : apiStatus === "offline"
                    ? "bg-red-100"
                    : "bg-gray-200"
                }`}
              >
                <View
                  className={`w-2 h-2 rounded-full ${
                    apiStatus === "online"
                      ? "bg-emerald-500"
                      : apiStatus === "offline"
                      ? "bg-red-500"
                      : "bg-gray-400"
                  }`}
                />
              </View>
              <View>
                <Text className="text-gray-700 text-xs font-bold uppercase">
                  {apiStatus === "online"
                    ? "Cloud Online"
                    : apiStatus === "offline"
                    ? "Cloud Offline"
                    : "Checking..."}
                </Text>
                {responseTime && (
                  <Text className="text-gray-400 text-[10px] font-semibold mt-0.5">
                    Latency: {responseTime}ms
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* 💻 Developer Info Card */}
        <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5 ml-1">
          Developer Details
        </Text>
        <View className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm mb-6">
          <View className="flex-row items-center mb-4">
            <View className="w-10 h-10 bg-blue-50 rounded-xl items-center justify-center mr-3">
              <Ionicons name="code-slash" size={20} color="#2563EB" />
            </View>
            <View>
              <Text className="text-gray-800 text-base font-extrabold">Harsh</Text>
              <Text className="text-gray-400 text-xs">Full-Stack Mobile Engineer</Text>
            </View>
          </View>

          <View className="border-t border-gray-100 pt-4 flex-row justify-between items-center">
            <Text className="text-gray-500 text-xs font-bold">Project Repository</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL("https://github.com/Harshp2405/Gsap_Tutorial")}
              className="flex-row items-center bg-blue-50 px-3.5 py-2 rounded-xl"
            >
              <Ionicons name="logo-github" size={14} color="#2563EB" />
              <Text className="text-blue-600 text-xs font-bold ml-1.5">Github</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
