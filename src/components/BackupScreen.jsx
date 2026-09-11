// src/components/BackupScreen.jsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Notifications from "expo-notifications";
import {
  isLoggedIn,
  saveTokens,
  clearTokens,
  getRedirectUri,
  getGoogleClientId,
} from "../lib/backup/googleAuth";
import { performBackup, getLastBackupInfo } from "../lib/backup/backupService";
import {
  listAvailableBackups,
  restoreFromBackup,
} from "../lib/backup/restoreService";
import {
  registerBackupTask,
  unregisterBackupTask,
} from "../lib/backup/backgroundTask";

WebBrowser.maybeCompleteAuthSession();

const DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

export default function BackupScreen({ isDark }) {
  const clientId = getGoogleClientId();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backupStatus, setBackupStatus] = useState("idle"); // idle|running|success|error
  const [lastBackup, setLastBackup] = useState({
    timestamp: null,
    fileName: null,
  });
  const [backups, setBackups] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const card = isDark ? "#1F2937" : "#FFFFFF";
  const text = isDark ? "#F9FAFB" : "#111827";
  const sub = isDark ? "#9CA3AF" : "#6B7280";
  const bg = isDark ? "#111827" : "#F9FAFB";

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: ["https://www.googleapis.com/auth/drive.appdata"],
      redirectUri: getRedirectUri(),
      responseType: AuthSession.ResponseType.Code,
      extraParams: { access_type: "offline", prompt: "consent" },
    },
    DISCOVERY,
  );

  useEffect(() => {
    isLoggedIn()
      .then(setLoggedIn)
      .finally(() => setLoading(false));
    getLastBackupInfo().then(setLastBackup);
  }, []);

  useEffect(() => {
    if (response?.type !== "success") return;
    (async () => {
      try {
        const tokenRes = await fetch(DISCOVERY.tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: response.params.code,
            client_id: clientId,
            redirect_uri: getRedirectUri(),
            grant_type: "authorization_code",
            code_verifier: request.codeVerifier,
          }).toString(),
        });
        const tokens = await tokenRes.json();
        if (tokens.error)
          throw new Error(tokens.error_description || tokens.error);
        await saveTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
        });
        await Notifications.requestPermissionsAsync();
        setLoggedIn(true);
        await registerBackupTask();
      } catch (e) {
        setErrorMsg("Login failed: " + e.message);
      }
    })();
  }, [response]);

  const handleLogout = () => {
    Alert.alert(
      "Disconnect Drive",
      "Stops automatic backups. Your local data is NOT deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await clearTokens();
            await unregisterBackupTask();
            setLoggedIn(false);
            setBackups([]);
          },
        },
      ],
    );
  };

  const handleBackupNow = async () => {
    setBackupStatus("running");
    setErrorMsg(null);
    try {
      await performBackup();
      setBackupStatus("success");
      setLastBackup(await getLastBackupInfo());
    } catch (e) {
      setBackupStatus("error");
      setErrorMsg(
        e.message === "NOT_AUTHENTICATED"
          ? "Please connect Google Drive first."
          : "Backup failed: " + e.message,
      );
    }
  };

  const handleShowBackups = async () => {
    setRestoreModal(true);
    setListLoading(true);
    try {
      setBackups(await listAvailableBackups());
    } catch (e) {
      setErrorMsg("Could not load backups: " + e.message);
    } finally {
      setListLoading(false);
    }
  };

  const handleRestore = (fileId, fileName) => {
    Alert.alert(
      "⚠️ Restore Backup",
      `Replace ALL local data with "${fileName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            setRestoringId(fileId);
            try {
              const r = await restoreFromBackup(fileId);
              setRestoreModal(false);
              Alert.alert(
                "✅ Restored!",
                `Expenses: ${r.restored.expenses}  •  Categories: ${r.restored.categories}  •  Fuel: ${r.restored.fuelLogs}  •  Income: ${r.restored.income}`,
              );
            } catch (e) {
              Alert.alert("Restore Failed", e.message);
            } finally {
              setRestoringId(null);
            }
          },
        },
      ],
    );
  };

  const fmt = (iso) =>
    iso
      ? new Date(iso).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Never";

  if (loading)
    return <ActivityIndicator color="#2563EB" style={{ marginVertical: 24 }} />;

  return (
    <View style={{ gap: 12 }}>
      {/* Header banner */}
      <View
        style={{ backgroundColor: "#2563EB", borderRadius: 20, padding: 18 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <Ionicons name="cloud-upload" size={26} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>
            Google Drive Backup
          </Text>
        </View>
        <Text style={{ color: "#BFDBFE", fontSize: 13 }}>
          Backs up supported local data when the operating system permits
          background work.
        </Text>
        {loggedIn && (
          <Text style={{ color: "#fff", fontSize: 12, marginTop: 8 }}>
            Last backup: {fmt(lastBackup.timestamp)}
          </Text>
        )}
      </View>

      {/* Error banner */}
      {errorMsg && (
        <View
          style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 12 }}
        >
          <Text style={{ color: "#DC2626", fontSize: 13 }}>{errorMsg}</Text>
        </View>
      )}

      {!loggedIn ? (
        <TouchableOpacity
          onPress={() => promptAsync()}
          disabled={!request}
          style={{
            backgroundColor: card,
            borderRadius: 16,
            padding: 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <Ionicons name="logo-google" size={24} color="#4285F4" />
          <Text style={{ color: text, fontWeight: "700", fontSize: 16 }}>
            Connect Google Drive
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          {/* Backup Now */}
          <TouchableOpacity
            onPress={handleBackupNow}
            disabled={backupStatus === "running"}
            style={{
              backgroundColor:
                backupStatus === "success" ? "#16A34A" : "#2563EB",
              borderRadius: 16,
              padding: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {backupStatus === "running" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={
                  backupStatus === "success"
                    ? "checkmark-circle"
                    : "cloud-upload"
                }
                size={22}
                color="#fff"
              />
            )}
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {backupStatus === "running"
                ? "Backing up…"
                : backupStatus === "success"
                  ? "Backup Complete!"
                  : "Backup Now"}
            </Text>
          </TouchableOpacity>

          {/* View & Restore */}
          <TouchableOpacity
            onPress={handleShowBackups}
            style={{
              backgroundColor: card,
              borderRadius: 16,
              padding: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: isDark ? "#374151" : "#E5E7EB",
            }}
          >
            <Ionicons name="cloud-download" size={22} color="#2563EB" />
            <Text style={{ color: text, fontWeight: "700", fontSize: 16 }}>
              View & Restore Backups
            </Text>
          </TouchableOpacity>

          {/* Auto-backup status chip */}
          <View
            style={{
              backgroundColor: card,
              borderRadius: 16,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: isDark ? "#374151" : "#E5E7EB",
            }}
          >
            <Ionicons name="timer" size={18} color="#16A34A" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: text, fontWeight: "600", fontSize: 14 }}>
                Auto Backup: Active
              </Text>
              <Text style={{ color: sub, fontSize: 12, marginTop: 2 }}>
                Runs on an OS-controlled schedule
              </Text>
            </View>
          </View>

          {/* Disconnect */}
          <TouchableOpacity
            onPress={handleLogout}
            style={{ alignItems: "center", paddingVertical: 4 }}
          >
            <Text style={{ color: "#DC2626", fontSize: 14, fontWeight: "600" }}>
              Disconnect Google Drive
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Restore Modal */}
      <Modal
        visible={restoreModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={{ flex: 1, backgroundColor: bg, padding: 20 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Text style={{ color: text, fontSize: 20, fontWeight: "800" }}>
              Your Backups
            </Text>
            <TouchableOpacity onPress={() => setRestoreModal(false)}>
              <Ionicons name="close-circle" size={28} color={sub} />
            </TouchableOpacity>
          </View>

          {listLoading ? (
            <ActivityIndicator size="large" color="#2563EB" />
          ) : backups.length === 0 ? (
            <Text
              style={{
                color: sub,
                textAlign: "center",
                marginTop: 48,
                fontSize: 15,
              }}
            >
              No backups found.
            </Text>
          ) : (
            <FlatList
              data={backups}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View
                  style={{
                    backgroundColor: card,
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: text, fontWeight: "600", fontSize: 14 }}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={{ color: sub, fontSize: 12, marginTop: 4 }}>
                      {fmt(item.createdTime)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRestore(item.id, item.name)}
                    disabled={!!restoringId}
                    style={{
                      backgroundColor: "#2563EB",
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                    }}
                  >
                    {restoringId === item.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Restore
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
