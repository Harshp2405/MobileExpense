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
          title: "Expenses",
          tabBarIcon: ({ color }) => (
            <Ionicons name='wallet-outline' size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='categories'
        options={{
          title: "Categories",
          tabBarIcon: ({ color }) => (
            <Ionicons name='grid-outline' size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='budgets'
        options={{
          title: "Budgets",
          tabBarIcon: ({ color }) => (
            <Ionicons name='pie-chart-outline' size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name='Analytics'
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => (
            <Ionicons name='bar-chart-outline' size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
