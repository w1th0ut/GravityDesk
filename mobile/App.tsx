import React, { useState } from "react";
import { StyleSheet, Text, View, SafeAreaView, StatusBar, ScrollView } from "react-native";
import { useLaptopVitals } from "./src/hooks/useLaptopVitals";
import { ConnectionCard } from "./src/components/ConnectionCard";

export default function App() {
  const { health, isConnected, isChecking } = useLaptopVitals(3000);
  const [showPairingModal, setShowPairingModal] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d1117" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚡ GravityDesk</Text>
        <Text style={styles.headerSubtitle}>Remote agy CLI</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ConnectionCard
          health={health}
          isConnected={isConnected}
          isChecking={isChecking}
          onPressSettings={() => setShowPairingModal(true)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
    backgroundColor: "#161b22",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#8b949e",
    fontWeight: "500",
  },
  scrollContent: {
    paddingBottom: 20,
  },
});
