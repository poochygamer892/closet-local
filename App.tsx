import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { migrate } from './src/db/database';
import { initStorage } from './src/services/storage';
import { logout, session } from './src/services/auth';
import { AuthScreen } from './src/screens/AuthScreen';
import { ClosetScreen } from './src/screens/ClosetScreen';
import { LooksScreen } from './src/screens/LooksScreen';
import { PackingScreen } from './src/screens/PackingScreen';
import { AddGarmentScreen } from './src/screens/AddGarmentScreen';

type Tab = 'closet' | 'looks' | 'packing' | 'account';

export default function App() {
  const [userId, setUserId] = useState<number | null | undefined>();
  const [tab, setTab] = useState<Tab>('looks');
  const [adding, setAdding] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [retry, setRetry] = useState(0);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setUserId(undefined);
      setStartupError(null);

      try {
        migrate();
        await initStorage();
        const id = await session();
        if (active) setUserId(id);
      } catch (error) {
        if (active) {
          setStartupError(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [retry]);

  return (
    <SafeAreaProvider>
      <StatusBar style={userId === null ? 'light' : 'dark'} />
      {startupError ? (
        <View style={styles.startup}>
          <Text style={styles.startupTitle}>No se pudo iniciar</Text>
          <Text style={styles.startupCopy}>
            Tus datos siguen en este teléfono. Cierra y vuelve a abrir la app o
            reintenta la inicialización.
          </Text>
          <Text selectable style={styles.errorDetails}>
            {startupError}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={styles.retry}
            onPress={() => setRetry(value => value + 1)}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : userId === undefined ? (
        <View style={styles.startup}>
          <ActivityIndicator color="#050505" />
          <Text style={styles.loading}>Preparando tu armario…</Text>
        </View>
      ) : userId === null ? (
        <AuthScreen done={setUserId} />
      ) : (
        <View style={styles.app}>
          {tab === 'closet' ? (
            <ClosetScreen userId={userId} refresh={refresh} />
          ) : tab === 'looks' ? (
            <LooksScreen userId={userId} refresh={refresh} />
          ) : tab === 'packing' ? (
            <PackingScreen userId={userId} refresh={refresh} />
          ) : (
            <View style={styles.account}>
              <Text style={styles.accountTitle}>Tu perfil</Text>
              <Text style={styles.accountCopy}>
                Tus cuentas, fotografías y modelos de IA permanecen dentro de
                este teléfono.
              </Text>
              <View style={styles.accountTile}>
                <Text style={styles.tileTitle}>Privacidad local</Text>
                <Text style={styles.tileCopy}>
                  Sin nube · Sin rastreo · Sin suscripciones
                </Text>
              </View>
              <Pressable
                style={styles.logout}
                onPress={async () => {
                  await logout();
                  setUserId(null);
                }}
              >
                <Text style={styles.logoutText}>Cerrar sesión</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.nav}>
            {(
              [
                ['packing', 'Maletas', '◇'],
                ['closet', 'Armario', '▢'],
                ['looks', 'Stylist', '✦'],
                ['account', 'Perfil', '♙'],
              ] as const
            ).map(([id, label, icon]) => (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                style={[styles.navItem, tab === id && styles.navActive]}
              >
                <Text style={[styles.icon, tab === id && styles.active]}>
                  {icon}
                </Text>
                <Text style={[styles.navText, tab === id && styles.active]}>
                  {label}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.add} onPress={() => setAdding(true)}>
              <Text style={styles.addText}>＋</Text>
            </Pressable>
          </View>
          <Modal visible={adding} animationType="slide">
            <AddGarmentScreen
              userId={userId}
              close={() => setAdding(false)}
              saved={() => setRefresh(value => value + 1)}
            />
          </Modal>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#fff' },
  startup: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loading: { color: '#555', marginTop: 14, fontSize: 15 },
  startupTitle: { fontSize: 25, fontWeight: '900', color: '#050505' },
  startupCopy: {
    maxWidth: 360,
    color: '#666',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  errorDetails: {
    maxWidth: 360,
    color: '#8b2424',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
  retry: {
    minWidth: 150,
    marginTop: 22,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: '#050505',
    alignItems: 'center',
  },
  retryText: { color: '#fff', fontWeight: '800' },
  nav: {
    position: 'absolute',
    left: 18,
    right: 82,
    bottom: 14,
    height: 70,
    backgroundColor: 'rgba(245,245,247,.96)',
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 5 },
  },
  navItem: {
    flex: 1,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  navActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  icon: { color: '#94949A', fontSize: 20 },
  navText: { color: '#94949A', fontSize: 10, fontWeight: '700' },
  active: { color: '#050505' },
  add: {
    position: 'absolute',
    right: -66,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  addText: { fontSize: 34, color: '#fff', marginTop: -4 },
  account: { flex: 1, padding: 25, paddingTop: 80 },
  accountTitle: { fontSize: 42, fontWeight: '900', letterSpacing: -1.5 },
  accountCopy: { fontSize: 16, lineHeight: 24, color: '#777', marginTop: 12 },
  accountTile: {
    backgroundColor: '#F5F5F7',
    borderRadius: 20,
    padding: 20,
    marginTop: 28,
  },
  tileTitle: { fontSize: 18, fontWeight: '900' },
  tileCopy: { fontSize: 13, color: '#777', marginTop: 5 },
  logout: {
    marginTop: 25,
    backgroundColor: '#050505',
    borderRadius: 26,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: { fontWeight: '900', color: '#fff' },
});
