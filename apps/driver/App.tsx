import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Phase 0 stub — GPS + matching UI built in Phase 1 & 4
export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>Hello Driver</Text>
      <Text style={styles.sub}>Application chauffeur — Libreville</Text>
      <Text style={styles.phase}>Phase 1 — GPS & matching</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 16,
    color: '#94A3B8',
  },
  phase: {
    marginTop: 24,
    fontSize: 12,
    color: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1E293B',
    borderRadius: 999,
  },
});
