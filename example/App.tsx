import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { DefaultTheme, NavigationContainer, useIsFocused } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { useEvent } from 'expo';
import { useEffect, useMemo, useRef, useState } from 'react';
import PojlibExpo, {
  POJLIB_MOD_LOADERS,
  addPojlibExtraProject,
  addPojlibModrinthVersion,
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
  removePojlibExtraProject,
  type PojlibAccount,
  type PojlibInstance,
  type PojlibModLoader,
  type PojlibProject,
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
import WebView, {
  type WebViewMessageEvent,
} from 'react-native-webview';

const Drawer = createDrawerNavigator();
const POLL_INTERVAL_MS = 2000;
const MAX_LOG_LINES = 18;
const STORAGE_LAST_ACCOUNT_UUID = 'pojlib-expo-example:last-account-uuid';
const STORAGE_LAST_INSTANCE_NAME = 'pojlib-expo-example:last-instance-name';
const MODRINTH_DEFAULT_URL = 'https://modrinth.com/mods?g=categories:%27vr%27';
const MODRINTH_MESSAGE_TYPE = 'modrinth-download';

type PendingModInstall = {
  instanceName: string;
  projectName: string;
  fileName: string | null;
  versionId: string | null;
  versionLabel: string;
  url: string;
  pageUrl: string;
  type: string;
};

const MODRINTH_INJECTED_JAVASCRIPT = `
(function () {
  if (window.__pojlibModrinthDownloadHookInstalled) {
    true;
    return;
  }

  window.__pojlibModrinthDownloadHookInstalled = true;

  function findAnchor(target) {
    if (!target) {
      return null;
    }

    if (typeof target.closest === 'function') {
      return target.closest('a[download], a[href*="cdn.modrinth.com/data/"]');
    }

    while (target) {
      if (target.tagName === 'A') {
        return target;
      }
      target = target.parentElement;
    }

    return null;
  }

  document.addEventListener(
    'click',
    function (event) {
      var anchor = findAnchor(event.target);
      if (!anchor) {
        return;
      }

      var href = anchor.getAttribute('href');
      if (!href) {
        return;
      }

      var absoluteHref;
      try {
        absoluteHref = new URL(href, window.location.href).toString();
      } catch (error) {
        return;
      }

      if (
        !anchor.hasAttribute('download') &&
        absoluteHref.indexOf('cdn.modrinth.com/data/') === -1
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!window.ReactNativeWebView) {
        return;
      }

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: '${MODRINTH_MESSAGE_TYPE}',
          url: absoluteHref,
          download: anchor.getAttribute('download'),
          pageUrl: window.location.href,
          title: document.title || ''
        })
      );
    },
    true
  );
})();
true;
`;

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
                title: 'Modrinth Browser',
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
  const isFocused = useIsFocused();

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
  const [inspectedInstanceName, setInspectedInstanceName] = useState<string | null>(null);

  const autoLoginAttemptedFor = useRef<string | null>(null);
  const hasInstallingInstance = instances.some((instance) => !instance.classpath);
  const selectedInstance =
    instances.find((instance) => instance.instanceName === selectedInstanceName) ?? null;
  const inspectedInstance =
    instances.find((instance) => instance.instanceName === inspectedInstanceName) ?? null;
  const inspectedMods = (inspectedInstance?.extProjects ?? []).filter(
    (project) => project.type === 'mod'
  );
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
    if (!isFocused) {
      return;
    }

    void refreshAll();
  }, [isFocused]);

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

  useEffect(() => {
    if (inspectedInstanceName && !instances.some((instance) => instance.instanceName === inspectedInstanceName)) {
      setInspectedInstanceName(null);
    }
  }, [inspectedInstanceName, instances]);

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

  async function removeInstalledProject(instanceName: string, project: PojlibProject) {
    const removed = await removePojlibExtraProject(instanceName, project.slug);
    if (!removed) {
      throw new Error(
        `Could not remove '${project.slug}'. Core/default mods cannot be removed from this screen.`
      );
    }

    await refreshAll();
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
                {instance.modLoader ?? 'Unknown loader'} | {instance.extProjects.length} extra projects |{' '}
                {instance.classpath ? 'Ready' : 'Installing'}
                {instance.instanceName === selectedInstanceName ? ' | Selected' : ''}
              </Text>
              <View style={styles.actions}>
                <ActionButton
                  label="Select"
                  variant="secondary"
                  onPress={() => setSelectedInstanceName(instance.instanceName)}
                />
                <ActionButton
                  label="Inspect Mods"
                  variant="secondary"
                  onPress={() => setInspectedInstanceName(instance.instanceName)}
                />
              </View>
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

      <Modal
        transparent
        visible={Boolean(inspectedInstance)}
        animationType="fade"
        onRequestClose={() => setInspectedInstanceName(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>
              Installed Mods{inspectedInstance ? ` | ${inspectedInstance.instanceName}` : ''}
            </Text>
            {inspectedMods.length === 0 ? (
              <Text style={styles.muted}>No installed mods are registered for this instance.</Text>
            ) : (
              <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                {inspectedMods.map((project) => (
                  <View key={`${project.slug}-${project.version ?? 'unknown'}`} style={styles.projectRow}>
                    <View style={styles.projectTextWrap}>
                      <Text style={styles.projectTitle}>{formatProjectTitle(project)}</Text>
                      <Text style={styles.projectMeta}>
                        {project.version ?? 'Unknown version'} | {project.fileName ?? 'Legacy file name'}
                      </Text>
                    </View>
                    <ActionButton
                      label="Delete"
                      variant="secondary"
                      disabled={!!busyLabel}
                      onPress={() =>
                        runAction(`Removing ${project.slug}`, async () => {
                          if (!inspectedInstance) {
                            throw new Error('The selected instance is no longer available.');
                          }

                          await removeInstalledProject(inspectedInstance.instanceName, project);
                        })
                      }
                    />
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.actions}>
              <ActionButton
                label="Close"
                variant="secondary"
                onPress={() => setInspectedInstanceName(null)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ModrinthScreen() {
  const isFocused = useIsFocused();
  const webViewRef = useRef<WebView>(null);

  const [instances, setInstances] = useState<PojlibInstance[]>([]);
  const [selectedInstanceName, setSelectedInstanceName] = useState('');
  const [lastInstanceName, setLastInstanceName] = useState<string | null>(null);
  const [webUrlInput, setWebUrlInput] = useState(MODRINTH_DEFAULT_URL);
  const [webUrl, setWebUrl] = useState(MODRINTH_DEFAULT_URL);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<PendingModInstall | null>(null);

  useEffect(() => {
    void loadStoredInstanceSelection();
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void refreshInstances();
  }, [isFocused]);

  useEffect(() => {
    if (instances.length === 0) {
      if (selectedInstanceName) {
        setSelectedInstanceName('');
      }
      return;
    }

    if (instances.some((instance) => instance.instanceName === selectedInstanceName)) {
      return;
    }

    const nextSelection =
      lastInstanceName && instances.some((instance) => instance.instanceName === lastInstanceName)
        ? lastInstanceName
        : instances[0].instanceName;

    setSelectedInstanceName(nextSelection);
  }, [instances, lastInstanceName, selectedInstanceName]);

  useEffect(() => {
    if (!selectedInstanceName) {
      return;
    }

    setLastInstanceName(selectedInstanceName);
    void AsyncStorage.setItem(STORAGE_LAST_INSTANCE_NAME, selectedInstanceName);
  }, [selectedInstanceName]);

  async function loadStoredInstanceSelection() {
    const value = await AsyncStorage.getItem(STORAGE_LAST_INSTANCE_NAME);
    setLastInstanceName(value);
    if (value) {
      setSelectedInstanceName(value);
    }
  }

  async function refreshInstances() {
    setInstances(await loadPojlibInstances());
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

  function queueDownloadInstall(raw: {
    url: string;
    download?: string | null;
    pageUrl?: string | null;
    title?: string | null;
  }): boolean {
    if (!selectedInstanceName) {
      setError('Select an installed instance before downloading a mod.');
      return true;
    }

    const pending = createPendingInstall(
      selectedInstanceName,
      raw.url,
      raw.download ?? null,
      raw.pageUrl ?? webUrl,
      raw.title ?? null
    );

    if (!pending) {
      return false;
    }

    setPendingInstall(pending);
    setError(null);
    return true;
  }

  function handleWebViewMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        url?: string;
        download?: string | null;
        pageUrl?: string | null;
        title?: string | null;
      };

      if (payload.type !== MODRINTH_MESSAGE_TYPE || !payload.url) {
        return;
      }

      queueDownloadInstall({
        url: payload.url,
        download: payload.download ?? null,
        pageUrl: payload.pageUrl ?? null,
        title: payload.title ?? null,
      });
    } catch {
      // Ignore malformed bridge messages from the page.
    }
  }

  function handleShouldStartLoad(request: { url: string; mainDocumentURL?: string }) {
    const intercepted = queueDownloadInstall({
      url: request.url,
      pageUrl: request.mainDocumentURL ?? webUrl,
      title: null,
    });

    return !intercepted;
  }

  async function confirmInstall() {
    if (!pendingInstall) {
      return;
    }

    await runAction(`Installing ${pendingInstall.projectName}`, async () => {
      if (pendingInstall.versionId) {
        await addPojlibModrinthVersion({
          instanceName: pendingInstall.instanceName,
          versionId: pendingInstall.versionId,
          type: pendingInstall.type,
        });
      } else {
        await addPojlibExtraProject({
          instanceName: pendingInstall.instanceName,
          name: pendingInstall.projectName,
          fileName: pendingInstall.fileName,
          version: pendingInstall.versionLabel,
          url: pendingInstall.url,
          type: pendingInstall.type,
        });
      }

      await refreshInstances();
      setPendingInstall(null);
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Modrinth</Text>
          <Text style={styles.label}>
            Target instance: {selectedInstanceName || 'Select an installed instance first'}
          </Text>
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
                    label={`${instance.instanceName} | ${instance.modLoader ?? 'Unknown loader'}`}
                    value={instance.instanceName}
                  />
                ))
              )}
            </Picker>
          </View>
          <View style={styles.browserBar}>
            <TextInput
              value={webUrlInput}
              onChangeText={setWebUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://modrinth.com/mod/vivecraft"
              placeholderTextColor="#7a7468"
              style={styles.input}
            />
            <ActionButton
              label="Go"
              onPress={() => {
                const normalized = normalizeBrowserUrl(webUrlInput);
                setWebUrlInput(normalized);
                setWebUrl(normalized);
              }}
            />
            <ActionButton
              label="Reload"
              variant="secondary"
              onPress={() => webViewRef.current?.reload()}
            />
          </View>
          <Text style={styles.helperText}>
            Clicking a Modrinth download button opens an app-level confirmation dialog before the
            mod is added to the selected instance.
          </Text>
          {busyLabel ? <Text style={styles.label}>Busy: {busyLabel}</Text> : null}
          {error ? <Text style={styles.error}>Error: {error}</Text> : null}
        </View>

        <View style={styles.webViewShell}>
          <WebView
            ref={webViewRef}
            source={{ uri: webUrl }}
            style={styles.webView}
            onMessage={handleWebViewMessage}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            injectedJavaScriptBeforeContentLoaded={MODRINTH_INJECTED_JAVASCRIPT}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
          />
        </View>
      </View>

      <Modal
        transparent
        visible={Boolean(pendingInstall)}
        animationType="fade"
        onRequestClose={() => setPendingInstall(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Install Mod</Text>
            {pendingInstall ? (
              <>
                <Text style={styles.label}>
                  You are about to install {pendingInstall.projectName} into{' '}
                  {pendingInstall.instanceName}.
                </Text>
                <Text style={styles.helperText}>
                  {pendingInstall.fileName ?? pendingInstall.versionLabel}
                </Text>
              </>
            ) : null}
            <View style={styles.actions}>
              <ActionButton
                label="Continue"
                disabled={!!busyLabel}
                onPress={() => {
                  void confirmInstall();
                }}
              />
              <ActionButton
                label="Cancel"
                variant="secondary"
                onPress={() => setPendingInstall(null)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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

function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return MODRINTH_DEFAULT_URL;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function createPendingInstall(
  instanceName: string,
  rawUrl: string,
  downloadName: string | null,
  pageUrl: string,
  pageTitle: string | null
): PendingModInstall | null {
  const normalizedPageUrl = normalizeBrowserUrl(pageUrl);
  const normalizedUrl = new URL(rawUrl, normalizedPageUrl).toString();
  if (!normalizedUrl.includes('cdn.modrinth.com/data/')) {
    return null;
  }

  const fileName = downloadName || decodeURIComponent(normalizedUrl.split('/').pop()?.split('?')[0] ?? '');
  const versionId = normalizedUrl.match(/\/versions\/([^/]+)/)?.[1] ?? null;
  const versionLabel = versionId ?? fileName ?? 'unknown-version';
  const projectName = inferProjectName(pageTitle, normalizedPageUrl, fileName);

  return {
    instanceName,
    projectName,
    fileName: fileName || null,
    versionId,
    versionLabel,
    url: normalizedUrl,
    pageUrl: normalizedPageUrl,
    type: inferProjectType(normalizedPageUrl),
  };
}

function inferProjectName(pageTitle: string | null, pageUrl: string, fileName: string) {
  const cleanedTitle = pageTitle?.replace(/\s*\|\s*Modrinth\s*$/i, '').trim();
  if (cleanedTitle) {
    return cleanedTitle;
  }

  try {
    const url = new URL(pageUrl);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 2) {
      return pathSegments[pathSegments.length - 1];
    }
  } catch {
    // Ignore URL parsing failures and fall through to the file name fallback.
  }

  return fileName.replace(/\.(jar|zip)$/i, '') || 'modrinth-download';
}

function inferProjectType(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    const firstSegment = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    return firstSegment === 'resourcepack' ? 'resourcepack' : 'mod';
  } catch {
    return 'mod';
  }
}

function formatProjectTitle(project: PojlibProject) {
  return project.slug || project.fileName || 'Unknown project';
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
    flexGrow: 1,
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
    gap: 8,
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
  modalList: {
    maxHeight: 320,
  },
  modalListContent: {
    gap: 10,
  },
  input: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c6bba8',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#28322a',
  },
  browserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  webViewShell: {
    flex: 1,
    minHeight: 540,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#c6bba8',
    overflow: 'hidden',
    backgroundColor: '#f8f2e8',
  },
  webView: {
    flex: 1,
    backgroundColor: '#f8f2e8',
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8cebd',
    backgroundColor: '#fffdf8',
    padding: 12,
  },
  projectTextWrap: {
    flex: 1,
    gap: 4,
  },
  projectTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#28322a',
  },
  projectMeta: {
    fontSize: 12,
    color: '#6b655b',
  },
});
