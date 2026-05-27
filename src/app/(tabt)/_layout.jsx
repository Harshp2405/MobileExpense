import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
          elevation: 0,
          shadowOpacity: 0,
        },
      }}>
      <Tabs.Screen
        name='index'
        options={{
          title: "Index 2",
          tabBarIcon: ({ color }) => (
            <Ionicons name='wallet-outline' size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='DataShow'
        options={{
          title: "DataShow",
          tabBarIcon: ({ color }) => (
            <Ionicons name='grid-outline' size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='UserSettings'
        options={{
          title: "UserSettings",
          tabBarIcon: ({ color }) => (
            <Ionicons name='pie-chart-outline' size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
