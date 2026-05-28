import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { useEvent } from 'expo';
import { useEffect, useMemo, useRef, useState } from 'react';
import PojlibExpo, {
  POJLIB_MOD_LOADERS,
  getPojlibGitBranch,
  getPojlibStatus,
  getPojlibSupportedVersions,
  initializePojlib,
  installDefaultPojlibInstance,
  isPojlibBridgeAvailable,
  launchPojlibInstance,
  listPojlibAccounts,
  loadPojlibInstances,
  loginToPojlib,
  prelaunchPojlibInstance,
  readPojlibLatestLog,
  readPojlibPreviousLog,
  type PojlibAccount,
  type PojlibInstance,
  type PojlibModLoader,
  type PojlibStatus,
} from 'pojlib-expo';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const Drawer = createDrawerNavigator();
const POLL_INTERVAL_MS = 2000;
const MAX_LOG_LINES = 18;
const MODRINTH_URL = 'https://modrinth.com/';
const STORAGE_LAST_ACCOUNT_UUID = 'pojlib-expo-example:last-account-uuid';
const STORAGE_LAST_INSTANCE_NAME = 'pojlib-expo-example:last-instance-name';

export default function App() {
  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: '#d7e0d1',
        card: '#f8f2e8',
        border: '#c6bba8',
        primary: '#304c3d',
        text: '#28322a',
      },
    }),
    []
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme}>
          <Drawer.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerStyle: {
                backgroundColor: '#f8f2e8',
              },
              headerTintColor: '#28322a',
              headerTitleStyle: {
                fontWeight: '700',
              },
              sceneStyle: {
                backgroundColor: '#d7e0d1',
              },
              drawerStyle: {
                backgroundColor: '#f1eadc',
                width: 280,
              },
              drawerActiveTintColor: '#f7f3e9',
              drawerInactiveTintColor: '#304c3d',
              drawerActiveBackgroundColor: '#304c3d',
              drawerLabelStyle: {
                fontWeight: '700',
              },
            }}
          >
            <Drawer.Screen
              name="Home"
              component={HomeScreen}
              options={{
                title: 'Pojlib Home',
                drawerLabel: 'Home',
              }}
            />
            <Drawer.Screen
              name="Modrinth"
              component={ModrinthScreen}
              options={{
                title: 'Modrinth',
                drawerLabel: 'Modrinth',
              }}
            />
          </Drawer.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function HomeScreen() {
  const bridgeAvailable = isPojlibBridgeAvailable();
  const gitBranch = getPojlibGitBranch();
  const logEvent = useEvent(PojlibExpo, 'onLog');

  const [status, setStatus] = useState<PojlibStatus | null>(null);
  const [accounts, setAccounts] = useState<PojlibAccount[]>([]);
  const [instances, setInstances] = useState<PojlibInstance[]>([]);
  const [supportedVersions, setSupportedVersions] = useState<string[]>([]);
  const [latestLog, setLatestLog] = useState<string | null>(null);
  const [previousLog, setPreviousLog] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [latestMclogsUrl, setLatestMclogsUrl] = useState<string | null>(null);
  const [previousMclogsUrl, setPreviousMclogsUrl] = useState<string | null>(null);
  const [previousMclogsStatus, setPreviousMclogsStatus] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoUploadedPreviousLog, setAutoUploadedPreviousLog] = useState<string | null>(null);
  const [lastAccountUuid, setLastAccountUuid] = useState<string | null>(null);
  const [lastInstanceName, setLastInstanceName] = useState<string | null>(null);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string>('');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstanceVersion, setNewInstanceVersion] = useState('');
  const [newInstanceModLoader, setNewInstanceModLoader] = useState<PojlibModLoader>('Fabric');

  const autoLoginAttemptedFor = useRef<string | null>(null);
  const hasInstallingInstance = instances.some((instance) => !instance.classpath);
  const selectedInstance =
    instances.find((instance) => instance.instanceName === selectedInstanceName) ?? null;
  const currentAccountUuid = status?.currentAccount?.uuid ?? null;
  const canPlay = Boolean(currentAccountUuid && selectedInstanceName && !busyLabel);

  useEffect(() => {
    void (async () => {
      await loadStoredPreferences();
      await runAction('Initializing', async () => {
        await initializePojlib();
        await refreshAll();
      });
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshStatusOnly();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!hasInstallingInstance) {
      return;
    }

    const timer = setInterval(() => {
      void refreshInstancesOnly();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [hasInstallingInstance]);

  useEffect(() => {
    if (!logEvent?.message) {
      return;
    }

    setLogLines((current) => {
      const next = [...current, logEvent.message];
      return next.slice(-MAX_LOG_LINES);
    });
  }, [logEvent]);

  useEffect(() => {
    if (!previousLog?.trim()) {
      return;
    }

    if (autoUploadedPreviousLog === previousLog || previousMclogsUrl) {
      return;
    }

    setPreviousMclogsStatus('Uploading previous session log to mclo.gs...');

    void uploadLogToMclogs(previousLog, 'pojlib-expo-example').then(
      (url) => {
        setPreviousMclogsUrl(url);
        setPreviousMclogsStatus(null);
        setAutoUploadedPreviousLog(previousLog);
      },
      (nextError) => {
        setPreviousMclogsStatus(
          nextError instanceof Error ? nextError.message : String(nextError)
        );
      }
    );
  }, [autoUploadedPreviousLog, previousLog, previousMclogsUrl]);

  useEffect(() => {
    if (!preferencesLoaded || currentAccountUuid || !lastAccountUuid) {
      return;
    }

    if (!accounts.some((account) => account.uuid === lastAccountUuid)) {
      return;
    }

    if (autoLoginAttemptedFor.current === lastAccountUuid) {
      return;
    }

    autoLoginAttemptedFor.current = lastAccountUuid;
    void runAction('Restoring account', async () => {
      await loginToPojlib(lastAccountUuid);
      await refreshAll();
    });
  }, [accounts, currentAccountUuid, lastAccountUuid, preferencesLoaded]);

  useEffect(() => {
    if (!currentAccountUuid) {
      return;
    }

    autoLoginAttemptedFor.current = currentAccountUuid;
    setLastAccountUuid(currentAccountUuid);
    void AsyncStorage.setItem(STORAGE_LAST_ACCOUNT_UUID, currentAccountUuid);
  }, [currentAccountUuid]);

  useEffect(() => {
    if (supportedVersions.length > 0 && !newInstanceVersion) {
      setNewInstanceVersion(supportedVersions[0]);
    }
  }, [newInstanceVersion, supportedVersions]);

  useEffect(() => {
    if (instances.length === 0) {
      if (selectedInstanceName) {
        setSelectedInstanceName('');
      }
      return;
    }

    const exists = instances.some((instance) => instance.instanceName === selectedInstanceName);
    if (exists) {
      return;
    }

    const nextSelection =
      lastInstanceName && instances.some((instance) => instance.instanceName === lastInstanceName)
        ? lastInstanceName
        : status?.currentInstance?.instanceName &&
            instances.some((instance) => instance.instanceName === status.currentInstance?.instanceName)
          ? status.currentInstance.instanceName
          : instances[0].instanceName;

    setSelectedInstanceName(nextSelection);
  }, [instances, lastInstanceName, selectedInstanceName, status?.currentInstance?.instanceName]);

  useEffect(() => {
    if (!selectedInstanceName) {
      return;
    }

    setLastInstanceName(selectedInstanceName);
    void AsyncStorage.setItem(STORAGE_LAST_INSTANCE_NAME, selectedInstanceName);
  }, [selectedInstanceName]);

  async function loadStoredPreferences() {
    try {
      const entries = await AsyncStorage.multiGet([
        STORAGE_LAST_ACCOUNT_UUID,
        STORAGE_LAST_INSTANCE_NAME,
      ]);
      const accountUuid = entries.find(([key]) => key === STORAGE_LAST_ACCOUNT_UUID)?.[1] ?? null;
      const instanceName = entries.find(([key]) => key === STORAGE_LAST_INSTANCE_NAME)?.[1] ?? null;
      setLastAccountUuid(accountUuid);
      setLastInstanceName(instanceName);
    } finally {
      setPreferencesLoaded(true);
    }
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusyLabel(label);
    setError(null);

    try {
      await action();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusyLabel(null);
    }
  }

  async function refreshStatusOnly() {
    try {
      const nextStatus = await getPojlibStatus();
      setStatus(nextStatus);
    } catch {
      // Ignore poll failures during background refresh.
    }
  }

  async function refreshAll() {
    const [nextStatus, nextAccounts, nextInstances, nextVersions, nextLog, nextPreviousLog] =
      await Promise.all([
        getPojlibStatus(),
        listPojlibAccounts(),
        loadPojlibInstances(),
        getPojlibSupportedVersions(),
        readPojlibLatestLog(),
        readPojlibPreviousLog(),
      ]);

    setStatus(nextStatus);
    setAccounts(nextAccounts);
    setInstances(nextInstances);
    setSupportedVersions(nextVersions);
    setLatestLog(nextLog);
    setPreviousLog(nextPreviousLog);
    if (nextPreviousLog !== previousLog) {
      setPreviousMclogsUrl(null);
      setPreviousMclogsStatus(null);
      setAutoUploadedPreviousLog(null);
    }
  }

  async function refreshInstancesOnly() {
    try {
      setInstances(await loadPojlibInstances());
    } catch {
      // Ignore background instance refresh failures.
    }
  }

  async function startLogin(accountUuid?: string | null) {
    await loginToPojlib(accountUuid ?? null);
    await refreshAll();
  }

  async function installPresetInstance() {
    const trimmedName = newInstanceName.trim();
    if (!trimmedName) {
      throw new Error('Enter an instance name.');
    }

    if (!newInstanceVersion) {
      throw new Error('Select a preset version.');
    }

    await installDefaultPojlibInstance({
      minecraftVersion: newInstanceVersion,
      instanceName: trimmedName,
      modLoader: newInstanceModLoader,
    });
    await refreshAll();
    setSelectedInstanceName(trimmedName);
    setCreateModalVisible(false);
    setNewInstanceName('');
  }

  async function playSelectedInstance() {
    const selectedAccount = status?.currentAccount;
    if (!selectedAccount) {
      throw new Error('Login is required before launching an instance.');
    }

    if (!selectedInstance) {
      throw new Error('Select an installed instance first.');
    }

    await prelaunchPojlibInstance(selectedInstance.instanceName);
    await refreshAll();
    await launchPojlibInstance(selectedInstance.instanceName, selectedAccount.uuid);
  }

  async function uploadLogToMclogs(logContent: string, source: string) {
    const response = await fetch('https://api.mclo.gs/1/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: logContent,
        source,
      }),
    });

    const payload = (await response.json()) as {
      success?: boolean;
      url?: string;
      error?: string;
    };
    if (!response.ok || !payload.success || !payload.url) {
      throw new Error(payload.error ?? `mclo.gs upload failed with status ${response.status}.`);
    }

    return payload.url;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <Text style={styles.header}>Pojlib Expo Tester</Text>
          <Text style={styles.label}>Bridge available: {String(bridgeAvailable)}</Text>
          <Text style={styles.label}>Pojlib branch: {gitBranch ?? 'Unavailable'}</Text>
          <Text style={styles.label}>Busy: {busyLabel ?? 'Idle'}</Text>
          <Text style={styles.label}>User home: {status?.userHome ?? 'Not initialized yet'}</Text>
          <Text style={styles.label}>
            Current profile: {status?.profileName ?? 'No account loaded'}
          </Text>
          <Text style={styles.label}>
            Selected instance: {selectedInstanceName || 'No installed instance selected'}
          </Text>
          <Text style={styles.label}>
            Microsoft login message: {status?.msaMessage || 'None'}
          </Text>
          {error ? <Text style={styles.error}>Error: {error}</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Quick Play</Text>
          <Text style={styles.label}>
            {currentAccountUuid
              ? `Logged in as ${status?.currentAccount?.username ?? 'Unknown'}`
              : lastAccountUuid
                ? 'Restores your last used account automatically when available.'
                : 'Login once to unlock Play and remember the last used account.'}
          </Text>
          <View style={styles.quickPlayRow}>
            <View style={styles.pickerShell}>
              <Picker
                selectedValue={selectedInstanceName}
                onValueChange={(value) => setSelectedInstanceName(String(value))}
                enabled={instances.length > 0}
                mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                style={styles.picker}
                dropdownIconColor="#304c3d"
              >
                {instances.length === 0 ? (
                  <Picker.Item label="No installed instances" value="" />
                ) : (
                  instances.map((instance) => (
                    <Picker.Item
                      key={instance.instanceName}
                      label={instance.instanceName}
                      value={instance.instanceName}
                    />
                  ))
                )}
              </Picker>
            </View>
            <ActionButton
              label="Play"
              disabled={!canPlay}
              onPress={() =>
                runAction(`Launching ${selectedInstanceName}`, async () => {
                  await playSelectedInstance();
                })
              }
            />
          </View>
          {!currentAccountUuid ? (
            <Text style={styles.helperText}>Play is only enabled while a saved account is active.</Text>
          ) : null}
          <View style={styles.actions}>
            <ActionButton
              label="Create Instance"
              onPress={() => {
                setNewInstanceVersion(supportedVersions[0] ?? '');
                setNewInstanceModLoader('Fabric');
                setCreateModalVisible(true);
              }}
            />
            <ActionButton
              label="Refresh"
              onPress={() =>
                runAction('Refreshing', async () => {
                  await refreshAll();
                })
              }
            />
            <ActionButton
              label={currentAccountUuid ? 'Reopen Login' : 'Start Login'}
              onPress={() =>
                runAction('Starting login', async () => {
                  await startLogin();
                })
              }
            />
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Accounts</Text>
          {accounts.length === 0 ? <Text style={styles.muted}>No saved accounts</Text> : null}
          {accounts.map((account) => (
            <View key={account.uuid} style={styles.installRow}>
              <Text style={styles.item}>
                {account.username}
                {status?.currentAccount?.uuid === account.uuid ? ' | Active' : ''}
              </Text>
              <ActionButton
                label={status?.currentAccount?.uuid === account.uuid ? 'Selected' : 'Use Account'}
                onPress={() =>
                  runAction(`Selecting ${account.username}`, async () => {
                    await startLogin(account.uuid);
                  })
                }
              />
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Installed Instances</Text>
          {instances.length === 0 ? <Text style={styles.muted}>No instances found</Text> : null}
            {instances.map((instance) => (
              <View key={instance.instanceName} style={styles.instanceCard}>
                <Text style={styles.item}>
                  {instance.instanceName} | {instance.versionName ?? 'Unknown version'} |{' '}
                  {instance.modLoader ?? 'Unknown loader'} |{' '}
                  {instance.extProjects.length} extra projects |{' '}
                  {instance.classpath ? 'Ready' : 'Installing'}
                  {instance.instanceName === selectedInstanceName ? ' | Selected' : ''}
                </Text>
              </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Supported Presets</Text>
          <Text style={styles.muted}>
            {supportedVersions.length > 0 ? supportedVersions.join(', ') : 'No versions loaded'}
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Live Log Events</Text>
          {logLines.length === 0 ? <Text style={styles.muted}>No events yet</Text> : null}
          {logLines.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.logLine}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Latest Log File</Text>
          <View style={styles.actions}>
            <ActionButton
              label="Upload Latest to mclo.gs"
              onPress={() =>
                runAction('Uploading latest log', async () => {
                  if (!latestLog?.trim()) {
                    throw new Error('No latest log is available to upload.');
                  }

                  setLatestMclogsUrl(await uploadLogToMclogs(latestLog, 'pojlib-expo-example'));
                })
              }
            />
          </View>
          {latestMclogsUrl ? <Text style={styles.label}>mclo.gs: {latestMclogsUrl}</Text> : null}
          <Text style={styles.logBlock}>{latestLog ?? 'No log file read yet'}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Previous Session Log</Text>
          <View style={styles.actions}>
            <ActionButton
              label="Upload Previous to mclo.gs"
              onPress={() =>
                runAction('Uploading previous log', async () => {
                  if (!previousLog?.trim()) {
                    throw new Error('No previous session log is available to upload.');
                  }

                  setPreviousMclogsStatus(null);
                  setPreviousMclogsUrl(await uploadLogToMclogs(previousLog, 'pojlib-expo-example'));
                  setAutoUploadedPreviousLog(previousLog);
                })
              }
            />
          </View>
          {previousMclogsUrl ? <Text style={styles.label}>mclo.gs: {previousMclogsUrl}</Text> : null}
          {previousMclogsStatus ? <Text style={styles.label}>{previousMclogsStatus}</Text> : null}
          <Text style={styles.logBlock}>{previousLog ?? 'No previous session log found yet'}</Text>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={createModalVisible}
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Create Instance</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={newInstanceName}
              onChangeText={setNewInstanceName}
              placeholder="QuestCraft My Pack"
              placeholderTextColor="#7a7468"
              style={styles.input}
            />
            <Text style={styles.label}>Preset</Text>
            <View style={styles.pickerShell}>
              <Picker
                selectedValue={newInstanceVersion}
                onValueChange={(value) => setNewInstanceVersion(String(value))}
                enabled={supportedVersions.length > 0}
                mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                style={styles.picker}
                dropdownIconColor="#304c3d"
              >
                {supportedVersions.length === 0 ? (
                  <Picker.Item label="No supported presets available" value="" />
                ) : (
                  supportedVersions.map((version) => (
                    <Picker.Item key={version} label={`QuestCraft ${version}`} value={version} />
                  ))
                )}
              </Picker>
            </View>
            <Text style={styles.label}>Mod Loader</Text>
            <View style={styles.pickerShell}>
              <Picker
                selectedValue={newInstanceModLoader}
                onValueChange={(value) => setNewInstanceModLoader(value as PojlibModLoader)}
                mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                style={styles.picker}
                dropdownIconColor="#304c3d"
              >
                {POJLIB_MOD_LOADERS.map((modLoader) => (
                  <Picker.Item key={modLoader} label={modLoader} value={modLoader} />
                ))}
              </Picker>
            </View>
            <View style={styles.actions}>
              <ActionButton
                label="Create"
                disabled={!newInstanceName.trim() || !newInstanceVersion || !!busyLabel}
                onPress={() =>
                  runAction('Creating instance', async () => {
                    await installPresetInstance();
                  })
                }
              />
              <ActionButton
                label="Cancel"
                variant="secondary"
                onPress={() => setCreateModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ModrinthScreen() {
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webFallback}>
          <Text style={styles.header}>Modrinth</Text>
          <Text style={styles.label}>
            The embedded WebView screen is intended for Android and iOS builds.
          </Text>
          <Text style={styles.label}>
            Open {MODRINTH_URL} in a native build to browse Modrinth here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.webViewShell}>
      <WebView
        source={{ uri: MODRINTH_URL }}
        style={styles.webView}
        startInLoadingState
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

function ActionButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const variant = props.variant ?? 'primary';

  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.button,
        variant === 'secondary' ? styles.buttonSecondary : null,
        props.disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' ? styles.buttonSecondaryText : null,
          props.disabled ? styles.buttonDisabledText : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#d7e0d1',
  },
  content: {
    padding: 18,
    gap: 14,
  },
  panel: {
    backgroundColor: '#f8f2e8',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#c6bba8',
  },
  header: {
    fontSize: 28,
    marginBottom: 14,
    fontWeight: '700',
    color: '#28322a',
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 10,
    fontWeight: '600',
    color: '#3f3626',
  },
  label: {
    fontSize: 15,
    marginBottom: 8,
    color: '#28322a',
  },
  helperText: {
    fontSize: 13,
    marginTop: 10,
    color: '#6b655b',
  },
  muted: {
    fontSize: 14,
    color: '#6b655b',
  },
  error: {
    marginTop: 8,
    color: '#8d1f1f',
    fontSize: 15,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickPlayRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  pickerShell: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c6bba8',
    backgroundColor: '#fffdf8',
    overflow: 'hidden',
  },
  picker: {
    minHeight: 56,
    color: '#28322a',
    ...Platform.select({
      android: {
        height: 56,
        paddingHorizontal: 12,
      },
      ios: {
        height: 180,
      },
      default: {},
    }),
  },
  button: {
    backgroundColor: '#304c3d',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#ebe3d2',
    borderWidth: 1,
    borderColor: '#c6bba8',
  },
  buttonDisabled: {
    backgroundColor: '#a7b2a8',
    borderColor: '#a7b2a8',
  },
  buttonText: {
    color: '#f7f3e9',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#304c3d',
  },
  buttonDisabledText: {
    color: '#eef2ee',
  },
  item: {
    fontSize: 14,
    marginBottom: 6,
    color: '#2d2d2d',
  },
  instanceCard: {
    marginBottom: 12,
  },
  installRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  logLine: {
    fontSize: 12,
    marginBottom: 4,
    color: '#3d423e',
  },
  logBlock: {
    fontSize: 12,
    color: '#3d423e',
  },
  webViewShell: {
    flex: 1,
    backgroundColor: '#d7e0d1',
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webFallback: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(25, 25, 25, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#f8f2e8',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#c6bba8',
    gap: 10,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c6bba8',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#28322a',
  },
});
