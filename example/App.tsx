import AsyncStorage from '@react-native-async-storage/async-storage';
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
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';

const POLL_INTERVAL_MS = 2000;
const MAX_LOG_LINES = 18;
const STORAGE_LAST_ACCOUNT_UUID = 'amethystxr:last-account-uuid';
const STORAGE_LAST_INSTANCE_NAME = 'amethystxr:last-instance-name';
const MODRINTH_DEFAULT_URL = 'https://modrinth.com/mods?g=categories:%27vr%27';
const MODRINTH_MESSAGE_TYPE = 'modrinth-download';
const FALLBACK_SUPPORTED_VERSIONS = ['1.21.4'];
const FABRIC_ICON = require('./assets/instance-icons/fabric.png');
const NEOFORGE_ICON = require('./assets/instance-icons/neoforge.png');

const BRAND_NAME = 'AMETHYSTXR';
const BRAND_TAGLINE = 'YOUR WORLD. ENHANCED.';

const COLORS = {
  bg: '#0a0813',
  sidebar: '#070510',
  panel: '#16131f',
  panelAlt: '#1d1830',
  hero: '#1a1230',
  heroDeep: '#0f0a1f',
  border: '#272036',
  borderSoft: '#1f1a2d',
  accent: '#8b5cf6',
  accentBright: '#a855f7',
  accentSoft: 'rgba(139, 92, 246, 0.16)',
  accentGlow: 'rgba(168, 85, 247, 0.28)',
  text: '#f4f1fb',
  textMuted: '#a39db8',
  textDim: '#6c6683',
  danger: '#f87171',
};

type LauncherView = 'home' | 'installations' | 'skins' | 'changelog' | 'download' | 'settings';

const HOME_TABS: { key: LauncherView; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'installations', label: 'Installations' },
  { key: 'skins', label: 'Skins' },
  { key: 'changelog', label: 'Changelog' },
];

type PendingModInstall = {
  instanceName: string;
  projectName: string;
  fileName: string | null;
  versionId: string | null;
  versionLabel: string;
  url: string;
  pageUrl: string;
  iconUrl: string | null;
  type: string;
};

const INSTANCE_LOADER_ICONS: Partial<Record<PojlibModLoader, ImageSourcePropType>> = {
  Fabric: FABRIC_ICON,
  NeoForge: NEOFORGE_ICON,
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
          title: document.title || '',
          imageUrl: (function () {
            var selectors = [
              'meta[property="og:image"]',
              'meta[name="og:image"]',
              'meta[name="twitter:image"]',
              'meta[property="twitter:image"]',
              'link[rel="apple-touch-icon"]',
              'link[rel="icon"]'
            ];

            for (var index = 0; index < selectors.length; index += 1) {
              var element = document.querySelector(selectors[index]);
              if (!element) {
                continue;
              }

              var candidate = element.getAttribute('content') || element.getAttribute('href');
              if (!candidate) {
                continue;
              }

              try {
                return new URL(candidate, window.location.href).toString();
              } catch (error) {
                continue;
              }
            }

            return null;
          })()
        })
      );
    },
    true
  );
})();
true;
`;

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Launcher />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Launcher() {
  const insets = useSafeAreaInsets();
  const bridgeAvailable = isPojlibBridgeAvailable();
  const gitBranch = getPojlibGitBranch();
  const logEvent = useEvent(PojlibExpo, 'onLog');
  const webViewRef = useRef<WebView>(null);

  const [activeView, setActiveView] = useState<LauncherView>('home');

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

  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [instanceMenuVisible, setInstanceMenuVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstanceVersion, setNewInstanceVersion] = useState('');
  const [newInstanceModLoader, setNewInstanceModLoader] = useState<PojlibModLoader>('Fabric');
  const [inspectedInstanceName, setInspectedInstanceName] = useState<string | null>(null);

  const [webUrl, setWebUrl] = useState(MODRINTH_DEFAULT_URL);
  const [pendingInstall, setPendingInstall] = useState<PendingModInstall | null>(null);
  const [webCanGoBack, setWebCanGoBack] = useState(false);
  const [webCanGoForward, setWebCanGoForward] = useState(false);
  const [webViewFullscreen, setWebViewFullscreen] = useState(false);

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
  const accountName = status?.currentAccount?.username ?? status?.profileName ?? null;
  const canPlay = Boolean(currentAccountUuid && selectedInstanceName && !busyLabel);
  const availableSupportedVersions =
    supportedVersions.length > 0 ? supportedVersions : FALLBACK_SUPPORTED_VERSIONS;
  const loginBusy =
    busyLabel === 'Starting login' ||
    busyLabel === 'Selecting account' ||
    busyLabel === 'Restoring account';
  const loginMessage = status?.msaMessage?.trim()
    ? status.msaMessage
    : loginBusy
      ? 'Opening Microsoft sign-in...'
      : 'Complete sign-in in the Microsoft page that opened, then return here.';

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

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hasInstallingInstance) {
      return;
    }

    const timer = setInterval(() => {
      void refreshInstancesOnly();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
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

    void uploadLogToMclogs(previousLog, 'amethystxr').then(
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
    if (!loginModalVisible || !currentAccountUuid) {
      return;
    }

    setLoginModalVisible(false);
  }, [currentAccountUuid, loginModalVisible]);

  useEffect(() => {
    if (availableSupportedVersions.length > 0 && !newInstanceVersion) {
      setNewInstanceVersion(availableSupportedVersions[0]);
    }
  }, [availableSupportedVersions, newInstanceVersion]);

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
            instances.some(
              (instance) => instance.instanceName === status.currentInstance?.instanceName
            )
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
    if (
      inspectedInstanceName &&
      !instances.some((instance) => instance.instanceName === inspectedInstanceName)
    ) {
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
      setStatus(await getPojlibStatus());
    } catch {
      // Ignore poll failures during background refresh.
    }
  }

  async function refreshAll() {
    const results = await Promise.allSettled([
      getPojlibStatus(),
      listPojlibAccounts(),
      loadPojlibInstances(),
      getPojlibSupportedVersions(),
      readPojlibLatestLog(),
      readPojlibPreviousLog(),
    ] as const);

    const nextStatus = results[0].status === 'fulfilled' ? results[0].value : status;
    const nextAccounts = results[1].status === 'fulfilled' ? results[1].value : accounts;
    const nextInstances = results[2].status === 'fulfilled' ? results[2].value : instances;
    const nextVersions =
      results[3].status === 'fulfilled'
        ? normalizeSupportedVersions(results[3].value)
        : normalizeSupportedVersions(supportedVersions);
    const nextLog = results[4].status === 'fulfilled' ? results[4].value : latestLog;
    const nextPreviousLog =
      results[5].status === 'fulfilled' ? results[5].value : previousLog;

    if (nextStatus) {
      setStatus(nextStatus);
    }
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

  async function runLoginAction(label: string, accountUuid?: string | null) {
    setLoginModalVisible(true);
    await runAction(label, () => startLogin(accountUuid));
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: logContent, source }),
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

  function queueDownloadInstall(raw: {
    url: string;
    download?: string | null;
    pageUrl?: string | null;
    title?: string | null;
    imageUrl?: string | null;
  }): boolean {
    const targetInstanceName = selectedInstanceName || instances[0]?.instanceName;
    if (!targetInstanceName) {
      setError('Install at least one instance before downloading a mod.');
      return true;
    }

    const pending = createPendingInstall(
      targetInstanceName,
      raw.url,
      raw.download ?? null,
      raw.pageUrl ?? webUrl,
      raw.title ?? null,
      raw.imageUrl ?? null
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
        imageUrl?: string | null;
      };

      if (payload.type !== MODRINTH_MESSAGE_TYPE || !payload.url) {
        return;
      }

      queueDownloadInstall({
        url: payload.url,
        download: payload.download ?? null,
        pageUrl: payload.pageUrl ?? null,
        title: payload.title ?? null,
        imageUrl: payload.imageUrl ?? null,
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

  function handleWebViewNavigationChange(state: WebViewNavigation) {
    setWebCanGoBack(state.canGoBack);
    setWebCanGoForward(state.canGoForward);
    setWebUrl(state.url);
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

      await refreshInstancesOnly();
      setPendingInstall(null);
    });
  }

  const isHomeRoute = activeView === 'home' || activeView === 'installations' ||
    activeView === 'skins' || activeView === 'changelog';

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <View style={styles.body}>
        {!webViewFullscreen ? (
          <Sidebar
            activeView={activeView}
            account={status?.currentAccount ?? null}
            loggedIn={Boolean(currentAccountUuid)}
            onNavigate={setActiveView}
            onOpenAccountMenu={() => setAccountMenuVisible(true)}
          />
        ) : null}

        <View style={[styles.main, webViewFullscreen ? styles.mainFullscreen : null]}>
          {isHomeRoute ? (
            <TopTabs
              active={activeView}
              onSelect={(key) => setActiveView(key)}
            />
          ) : !webViewFullscreen ? (
            <View style={styles.routeHeader}>
              <Text style={styles.routeHeaderTitle}>
                {activeView === 'download' ? 'Download Content' : 'Settings'}
              </Text>
            </View>
          ) : null}

          <View style={styles.mainContent}>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
                <Pressable onPress={() => setError(null)} hitSlop={10}>
                  <Text style={styles.errorBannerClose}>×</Text>
                </Pressable>
              </View>
            ) : null}

            {activeView === 'home' ? (
              <HomeView
                selectedInstance={selectedInstance}
                canPlay={canPlay}
                busyLabel={busyLabel}
                loggedIn={Boolean(currentAccountUuid)}
                onOpenInstanceMenu={() => setInstanceMenuVisible(true)}
                onLogin={() => void runLoginAction('Starting login')}
                onPlay={() =>
                  runAction(`Launching ${selectedInstanceName}`, () => playSelectedInstance())
                }
              />
            ) : null}

            {activeView === 'installations' ? (
              <InstallationsView
                instances={instances}
                selectedInstanceName={selectedInstanceName}
                busyLabel={busyLabel}
                onSelect={setSelectedInstanceName}
                onInspect={setInspectedInstanceName}
                onCreate={() => {
                  setNewInstanceVersion(availableSupportedVersions[0] ?? '');
                  setNewInstanceModLoader('Fabric');
                  setCreateModalVisible(true);
                }}
                onRefresh={() => runAction('Refreshing', () => refreshAll())}
              />
            ) : null}

            {activeView === 'skins' ? <SkinsView /> : null}

            {activeView === 'changelog' ? (
              <ChangelogView
                logLines={logLines}
                latestLog={latestLog}
                previousLog={previousLog}
                latestMclogsUrl={latestMclogsUrl}
                previousMclogsUrl={previousMclogsUrl}
                previousMclogsStatus={previousMclogsStatus}
                onUploadLatest={() =>
                  runAction('Uploading latest log', async () => {
                    if (!latestLog?.trim()) {
                      throw new Error('No latest log is available to upload.');
                    }
                    setLatestMclogsUrl(await uploadLogToMclogs(latestLog, 'amethystxr'));
                  })
                }
                onUploadPrevious={() =>
                  runAction('Uploading previous log', async () => {
                    if (!previousLog?.trim()) {
                      throw new Error('No previous session log is available to upload.');
                    }
                    setPreviousMclogsStatus(null);
                    setPreviousMclogsUrl(
                      await uploadLogToMclogs(previousLog, 'amethystxr')
                    );
                    setAutoUploadedPreviousLog(previousLog);
                  })
                }
              />
            ) : null}

            {activeView === 'download' ? (
              <DownloadView
                webViewRef={webViewRef}
                webUrl={webUrl}
                canGoBack={webCanGoBack}
                canGoForward={webCanGoForward}
                isFullscreen={webViewFullscreen}
                onGoBack={() => webViewRef.current?.goBack()}
                onGoForward={() => webViewRef.current?.goForward()}
                onToggleFullscreen={() => setWebViewFullscreen((current) => !current)}
                onMessage={handleWebViewMessage}
                onShouldStartLoad={handleShouldStartLoad}
                onNavigationStateChange={handleWebViewNavigationChange}
              />
            ) : null}

            {activeView === 'settings' ? (
              <SettingsView
                bridgeAvailable={bridgeAvailable}
                gitBranch={gitBranch}
                status={status}
                accounts={accounts}
                currentAccountUuid={currentAccountUuid}
                busyLabel={busyLabel}
                onUseAccount={(uuid) => void runLoginAction('Selecting account', uuid)}
                onLogin={() => void runLoginAction('Starting login')}
              />
            ) : null}
          </View>
        </View>
      </View>

      {busyLabel ? (
        <View style={styles.busyPill}>
          <ActivityIndicator size="small" color={COLORS.accentBright} />
          <Text style={styles.busyPillText}>{busyLabel}</Text>
        </View>
      ) : null}

      <AccountMenu
        visible={accountMenuVisible}
        accounts={accounts}
        currentAccountUuid={currentAccountUuid}
        busy={Boolean(busyLabel)}
        onClose={() => setAccountMenuVisible(false)}
        onUseAccount={(uuid) => {
          setAccountMenuVisible(false);
          void runLoginAction('Selecting account', uuid);
        }}
        onAddAccount={() => {
          setAccountMenuVisible(false);
          void runLoginAction('Starting login');
        }}
      />

      <LoginStatusModal
        visible={loginModalVisible}
        message={loginMessage}
        busy={loginBusy}
        onClose={() => setLoginModalVisible(false)}
      />

      <InstanceMenu
        visible={instanceMenuVisible}
        instances={instances}
        selectedInstanceName={selectedInstanceName}
        onClose={() => setInstanceMenuVisible(false)}
        onSelect={(name) => {
          setSelectedInstanceName(name);
          setInstanceMenuVisible(false);
        }}
      />

      <CreateInstanceModal
        visible={createModalVisible}
        name={newInstanceName}
        version={newInstanceVersion}
        modLoader={newInstanceModLoader}
        supportedVersions={availableSupportedVersions}
        busy={Boolean(busyLabel)}
        onChangeName={setNewInstanceName}
        onChangeVersion={setNewInstanceVersion}
        onChangeModLoader={setNewInstanceModLoader}
        onCancel={() => setCreateModalVisible(false)}
        onCreate={() => runAction('Creating instance', () => installPresetInstance())}
      />

      <InspectModsModal
        instance={inspectedInstance}
        mods={inspectedMods}
        busy={Boolean(busyLabel)}
        onClose={() => setInspectedInstanceName(null)}
        onRemove={(project) =>
          runAction(`Removing ${project.slug}`, async () => {
            if (!inspectedInstance) {
              throw new Error('The selected instance is no longer available.');
            }
            await removeInstalledProject(inspectedInstance.instanceName, project);
          })
        }
      />

      <InstallModModal
        pending={pendingInstall}
        instances={instances}
        busy={Boolean(busyLabel)}
        onCancel={() => setPendingInstall(null)}
        onChangeInstance={(name) => {
          setPendingInstall((current) =>
            current ? { ...current, instanceName: name } : current
          );
        }}
        onConfirm={() => void confirmInstall()}
      />
    </View>
  );
}

function Sidebar(props: {
  activeView: LauncherView;
  account: PojlibAccount | null;
  loggedIn: boolean;
  onNavigate: (view: LauncherView) => void;
  onOpenAccountMenu: () => void;
}) {
  const homeActive =
    props.activeView === 'home' ||
    props.activeView === 'installations' ||
    props.activeView === 'skins' ||
    props.activeView === 'changelog';

  return (
    <View style={styles.sidebar}>
      <Pressable style={styles.profile} onPress={props.onOpenAccountMenu}>
        <AccountAvatar name={props.account?.username ?? 'S'} skinFaceUrl={props.account?.skinFaceUrl} />
        <View style={styles.profileText}>
          <Text style={styles.profileName} numberOfLines={1}>
            {props.account?.username ?? 'Add account'}
          </Text>
          <Text style={styles.profileSub} numberOfLines={1}>
            {props.loggedIn ? 'Minecraft account' : 'Not signed in'}
          </Text>
        </View>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <View style={styles.navList}>
        <NavItem
          glyph="⌂"
          label="Home"
          active={homeActive}
          onPress={() => props.onNavigate('home')}
        />
        <NavItem
          glyph="⤓"
          label="Download Content"
          active={props.activeView === 'download'}
          onPress={() => props.onNavigate('download')}
        />
      </View>

      <View style={styles.sidebarSpacer} />

      <NavItem
        glyph="⚙"
        label="Settings"
        active={props.activeView === 'settings'}
        onPress={() => props.onNavigate('settings')}
      />
    </View>
  );
}

function AccountAvatar(props: {
  name: string | null | undefined;
  skinFaceUrl?: string | null;
  small?: boolean;
}) {
  const containerStyle = props.small ? styles.avatarSmall : styles.avatar;
  const imageStyle = props.small ? styles.avatarSmallImage : styles.avatarImage;

  return (
    <View style={containerStyle}>
      {props.skinFaceUrl ? (
        <Image source={{ uri: props.skinFaceUrl }} style={imageStyle} />
      ) : (
        <Text style={styles.avatarText}>{(props.name ?? 'S').slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
}

function InstanceLogo(props: {
  instance: Pick<PojlibInstance, 'instanceImageURL' | 'modLoader'> | null | undefined;
  size: number;
}) {
  const source = getInstanceLogoSource(props.instance);

  return (
    <View
      style={[
        styles.instanceLogo,
        {
          width: props.size,
          height: props.size,
          borderRadius: Math.round(props.size * 0.24),
        },
      ]}
    >
      {source ? (
        <Image source={source} style={styles.instanceLogoImage} resizeMode="cover" />
      ) : (
        <View style={styles.versionIconInner} />
      )}
    </View>
  );
}

function NavItem(props: {
  glyph: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.navItem, props.active ? styles.navItemActive : null]}
    >
      <Text style={[styles.navGlyph, props.active ? styles.navGlyphActive : null]}>
        {props.glyph}
      </Text>
      <Text style={[styles.navLabel, props.active ? styles.navLabelActive : null]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function TopTabs(props: { active: LauncherView; onSelect: (key: LauncherView) => void }) {
  return (
    <View style={styles.topTabs}>
      {HOME_TABS.map((tab) => {
        const active = props.active === tab.key;
        return (
          <Pressable key={tab.key} onPress={() => props.onSelect(tab.key)} style={styles.topTab}>
            <Text style={[styles.topTabLabel, active ? styles.topTabLabelActive : null]}>
              {tab.label}
            </Text>
            {active ? <View style={styles.topTabUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function HomeView(props: {
  selectedInstance: PojlibInstance | null;
  canPlay: boolean;
  busyLabel: string | null;
  loggedIn: boolean;
  onOpenInstanceMenu: () => void;
  onLogin: () => void;
  onPlay: () => void;
}) {
  const versionLabel = props.selectedInstance?.versionName ?? 'No version';
  const instanceLabel = props.selectedInstance?.instanceName ?? 'No instance selected';

  return (
    <View style={styles.homeWrap}>
      <View style={styles.hero}>
        <View style={styles.heroGlowOne} />
        <View style={styles.heroGlowTwo} />
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>{BRAND_NAME}</Text>
          <View style={styles.heroTaglineRow}>
            <Text style={styles.heroDiamond}>◆</Text>
            <Text style={styles.heroTagline}>{BRAND_TAGLINE}</Text>
            <Text style={styles.heroDiamond}>◆</Text>
          </View>
        </View>
      </View>

      <View style={styles.playBar}>
        <Pressable style={styles.versionSelector} onPress={props.onOpenInstanceMenu}>
          <InstanceLogo instance={props.selectedInstance} size={42} />
          <View style={styles.versionText}>
            <Text style={styles.versionTitle} numberOfLines={1}>
              {instanceLabel}
            </Text>
            <Text style={styles.versionSub} numberOfLines={1}>
              {versionLabel}
            </Text>
          </View>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>

        {props.loggedIn ? (
          <Pressable
            onPress={props.onPlay}
            disabled={!props.canPlay}
            style={[styles.playButton, !props.canPlay ? styles.playButtonDisabled : null]}
          >
            <Text style={styles.playButtonText}>Play</Text>
          </Pressable>
        ) : (
          <Pressable onPress={props.onLogin} style={styles.playButton}>
            <Text style={styles.playButtonText}>Sign In</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function InstallationsView(props: {
  instances: PojlibInstance[];
  selectedInstanceName: string;
  busyLabel: string | null;
  onSelect: (name: string) => void;
  onInspect: (name: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Installations</Text>
        <View style={styles.sectionActions}>
          <SecondaryButton label="Refresh" onPress={props.onRefresh} />
          <PrimaryButton label="New Installation" onPress={props.onCreate} />
        </View>
      </View>

      {props.instances.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            No installations yet. Create one to start playing.
          </Text>
        </Card>
      ) : null}

      {props.instances.map((instance) => {
        const selected = instance.instanceName === props.selectedInstanceName;
        return (
          <View
            key={instance.instanceName}
            style={[styles.instanceCard, selected ? styles.instanceCardActive : null]}
          >
            <InstanceLogo instance={instance} size={48} />
            <View style={styles.instanceInfo}>
              <Text style={styles.instanceName} numberOfLines={1}>
                {instance.instanceName}
              </Text>
              <Text style={styles.instanceMeta} numberOfLines={1}>
                {(instance.versionName ?? 'Unknown version') +
                  '  •  ' +
                  (instance.modLoader ?? 'Unknown loader') +
                  '  •  ' +
                  instance.extProjects.length +
                  ' mods  •  ' +
                  (instance.classpath ? 'Ready' : 'Installing…')}
              </Text>
            </View>
            <View style={styles.instanceActions}>
              <SecondaryButton
                label={selected ? 'Selected' : 'Select'}
                onPress={() => props.onSelect(instance.instanceName)}
              />
              <SecondaryButton
                label="Mods"
                onPress={() => props.onInspect(instance.instanceName)}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function SkinsView() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderGlyph}>◆</Text>
      <Text style={styles.placeholderTitle}>Skins</Text>
      <Text style={styles.placeholderText}>
        Skin management is coming soon to {BRAND_NAME}.
      </Text>
    </View>
  );
}

function ChangelogView(props: {
  logLines: string[];
  latestLog: string | null;
  previousLog: string | null;
  latestMclogsUrl: string | null;
  previousMclogsUrl: string | null;
  previousMclogsStatus: string | null;
  onUploadLatest: () => void;
  onUploadPrevious: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>Live Log</Text>
      <Card>
        {props.logLines.length === 0 ? (
          <Text style={styles.muted}>No events yet.</Text>
        ) : (
          props.logLines.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>Latest Log File</Text>
      <Card>
        <View style={styles.sectionActions}>
          <SecondaryButton label="Upload to mclo.gs" onPress={props.onUploadLatest} />
        </View>
        {props.latestMclogsUrl ? (
          <Text style={styles.linkText}>{props.latestMclogsUrl}</Text>
        ) : null}
        <Text style={styles.muted}>
          {props.latestLog?.trim() ? 'Latest log file is available.' : 'No log file read yet.'}
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Previous Session Log</Text>
      <Card>
        <View style={styles.sectionActions}>
          <SecondaryButton label="Upload to mclo.gs" onPress={props.onUploadPrevious} />
        </View>
        {props.previousMclogsUrl ? (
          <Text style={styles.linkText}>{props.previousMclogsUrl}</Text>
        ) : null}
        {props.previousMclogsStatus ? (
          <Text style={styles.muted}>{props.previousMclogsStatus}</Text>
        ) : null}
        <Text style={styles.muted}>
          {props.previousLog?.trim()
            ? 'Previous session log is available.'
            : 'No previous session log found yet.'}
        </Text>
      </Card>
    </ScrollView>
  );
}

function DownloadView(props: {
  webViewRef: React.RefObject<WebView | null>;
  webUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isFullscreen: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onToggleFullscreen: () => void;
  instances?: PojlibInstance[];
  selectedInstanceName?: string;
  webUrlInput?: string;
  onChangeUrlInput?: (value: string) => void;
  onSelectInstance?: (name: string) => void;
  onGo?: () => void;
  onReload?: () => void;
  onMessage: (event: WebViewMessageEvent) => void;
  onShouldStartLoad: (request: { url: string; mainDocumentURL?: string }) => boolean;
  onNavigationStateChange: (state: WebViewNavigation) => void;
}) {
  return (
    <View style={styles.downloadWrap}>
      <View style={styles.downloadBar}>
        <SecondaryButton label="Back" disabled={!props.canGoBack} onPress={props.onGoBack} />
        <SecondaryButton
          label="Forward"
          disabled={!props.canGoForward}
          onPress={props.onGoForward}
        />
        <View style={[styles.downloadPicker, styles.downloadControlHidden]}>
          <Picker
            selectedValue={props.selectedInstanceName ?? ''}
            onValueChange={(value) => props.onSelectInstance?.(String(value))}
            enabled={(props.instances?.length ?? 0) > 0}
            mode={Platform.OS === 'android' ? 'dropdown' : undefined}
            style={styles.picker}
            dropdownIconColor={COLORS.accentBright}
          >
            {(props.instances?.length ?? 0) === 0 ? (
              <Picker.Item label="No installed instances" value="" color={COLORS.text} />
            ) : (
              (props.instances ?? []).map((instance) => (
                <Picker.Item
                  key={instance.instanceName}
                  label={`${instance.instanceName} • ${instance.modLoader ?? 'Unknown'}`}
                  value={instance.instanceName}
                  color={COLORS.text}
                />
              ))
            )}
          </Picker>
        </View>
        <TextInput
          value={props.webUrlInput ?? ''}
          onChangeText={(value) => props.onChangeUrlInput?.(value)}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://modrinth.com/mod/vivecraft"
          placeholderTextColor={COLORS.textDim}
          style={[styles.urlInput, styles.downloadControlHidden]}
        />
      </View>

      <View style={styles.webViewShell}>
        <WebView
          ref={props.webViewRef}
          source={{ uri: props.webUrl }}
          style={styles.webView}
          onMessage={props.onMessage}
          onShouldStartLoadWithRequest={props.onShouldStartLoad}
          onNavigationStateChange={props.onNavigationStateChange}
          injectedJavaScriptBeforeContentLoaded={MODRINTH_INJECTED_JAVASCRIPT}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
        />
        <Pressable style={styles.fullscreenFab} onPress={props.onToggleFullscreen}>
          <Text style={styles.fullscreenFabText}>{props.isFullscreen ? '⤡' : '⤢'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SettingsView(props: {
  bridgeAvailable: boolean;
  gitBranch: string | null;
  status: PojlibStatus | null;
  accounts: PojlibAccount[];
  currentAccountUuid: string | null;
  busyLabel: string | null;
  onUseAccount: (uuid: string) => void;
  onLogin: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>Accounts</Text>
      <Card>
        {props.accounts.length === 0 ? (
          <Text style={styles.muted}>No saved accounts.</Text>
        ) : (
          props.accounts.map((account) => {
            const active = props.currentAccountUuid === account.uuid;
            return (
              <View key={account.uuid} style={styles.accountRow}>
                <AccountAvatar
                  name={account.username}
                  skinFaceUrl={account.skinFaceUrl}
                  small
                />
                <Text style={styles.accountName} numberOfLines={1}>
                  {account.username}
                  {active ? '  •  Active' : ''}
                </Text>
                <SecondaryButton
                  label={active ? 'Selected' : 'Use'}
                  onPress={() => props.onUseAccount(account.uuid)}
                />
              </View>
            );
          })
        )}
        <View style={styles.sectionActions}>
          <PrimaryButton
            label={props.currentAccountUuid ? 'Add Another Account' : 'Sign In'}
            onPress={props.onLogin}
          />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Diagnostics</Text>
      <Card>
        <DiagnosticRow label="Bridge available" value={String(props.bridgeAvailable)} />
        <DiagnosticRow label="Pojlib branch" value={props.gitBranch ?? 'Unavailable'} />
        <DiagnosticRow label="User home" value={props.status?.userHome ?? 'Not initialized'} />
        <DiagnosticRow
          label="Current profile"
          value={props.status?.profileName ?? 'No account loaded'}
        />
        {props.status?.msaMessage ? (
          <DiagnosticRow label="Microsoft login" value={props.status.msaMessage} />
        ) : null}
      </Card>
    </ScrollView>
  );
}

function DiagnosticRow(props: { label: string; value: string }) {
  return (
    <View style={styles.diagnosticRow}>
      <Text style={styles.diagnosticLabel}>{props.label}</Text>
      <Text style={styles.diagnosticValue} numberOfLines={2}>
        {props.value}
      </Text>
    </View>
  );
}

function AccountMenu(props: {
  visible: boolean;
  accounts: PojlibAccount[];
  currentAccountUuid: string | null;
  busy: boolean;
  onClose: () => void;
  onUseAccount: (uuid: string) => void;
  onAddAccount: () => void;
}) {
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.menuBackdrop} onPress={props.onClose}>
        <Pressable style={styles.accountMenu} onPress={() => {}}>
          <Text style={styles.menuTitle}>Accounts</Text>
          {props.accounts.length === 0 ? (
            <Text style={styles.muted}>No saved accounts yet.</Text>
          ) : (
            props.accounts.map((account) => {
              const active = props.currentAccountUuid === account.uuid;
              return (
                <Pressable
                  key={account.uuid}
                  style={[styles.menuRow, active ? styles.menuRowActive : null]}
                  onPress={() => props.onUseAccount(account.uuid)}
                >
                  <AccountAvatar
                    name={account.username}
                    skinFaceUrl={account.skinFaceUrl}
                    small
                  />
                  <Text style={styles.menuRowText} numberOfLines={1}>
                    {account.username}
                  </Text>
                  {active ? <Text style={styles.menuCheck}>✓</Text> : null}
                </Pressable>
              );
            })
          )}
          <PrimaryButton
            label={props.currentAccountUuid ? 'Add Another Account' : 'Sign In'}
            disabled={props.busy}
            onPress={props.onAddAccount}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LoginStatusModal(props: {
  visible: boolean;
  message: string;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.loginModalCard}>
          <Text style={styles.menuTitle}>Microsoft Login</Text>
          <View style={styles.loginModalMessageRow}>
            {props.busy ? (
              <ActivityIndicator size="small" color={COLORS.accentBright} />
            ) : null}
            <Text style={styles.loginModalMessage}>{props.message}</Text>
          </View>
          <View style={styles.modalActions}>
            <SecondaryButton label="Hide" onPress={props.onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InstanceMenu(props: {
  visible: boolean;
  instances: PojlibInstance[];
  selectedInstanceName: string;
  onClose: () => void;
  onSelect: (name: string) => void;
}) {
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.menuBackdrop} onPress={props.onClose}>
        <Pressable style={styles.instanceMenu} onPress={() => {}}>
          <Text style={styles.menuTitle}>Select Installation</Text>
          {props.instances.length === 0 ? (
            <Text style={styles.muted}>No installations available.</Text>
          ) : (
            <ScrollView style={styles.menuScroll}>
              {props.instances.map((instance) => {
                const active = instance.instanceName === props.selectedInstanceName;
                return (
                  <Pressable
                    key={instance.instanceName}
                    style={[styles.menuRow, active ? styles.menuRowActive : null]}
                    onPress={() => props.onSelect(instance.instanceName)}
                  >
                    <InstanceLogo instance={instance} size={42} />
                    <View style={styles.menuRowInfo}>
                      <Text style={styles.menuRowText} numberOfLines={1}>
                        {instance.instanceName}
                      </Text>
                      <Text style={styles.menuRowSub} numberOfLines={1}>
                        {(instance.versionName ?? 'Unknown') +
                          ' • ' +
                          (instance.modLoader ?? 'Unknown')}
                      </Text>
                    </View>
                    {active ? <Text style={styles.menuCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CreateInstanceModal(props: {
  visible: boolean;
  name: string;
  version: string;
  modLoader: PojlibModLoader;
  supportedVersions: string[];
  busy: boolean;
  onChangeName: (value: string) => void;
  onChangeVersion: (value: string) => void;
  onChangeModLoader: (value: PojlibModLoader) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <Modal
      transparent
      visible={props.visible}
      animationType="fade"
      onRequestClose={props.onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.menuTitle}>New Installation</Text>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={props.name}
            onChangeText={props.onChangeName}
            placeholder="My Pack"
            placeholderTextColor={COLORS.textDim}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Version</Text>
          <View style={styles.fieldPicker}>
            <Picker
              selectedValue={props.version}
              onValueChange={(value) => props.onChangeVersion(String(value))}
              enabled={props.supportedVersions.length > 0}
              mode={Platform.OS === 'android' ? 'dropdown' : undefined}
              style={styles.picker}
              dropdownIconColor={COLORS.accentBright}
            >
              {props.supportedVersions.length === 0 ? (
                <Picker.Item label="No presets available" value="" color={COLORS.text} />
              ) : (
                props.supportedVersions.map((version) => (
                  <Picker.Item
                    key={version}
                    label={version}
                    value={version}
                    color={COLORS.text}
                  />
                ))
              )}
            </Picker>
          </View>
          <Text style={styles.fieldLabel}>Mod Loader</Text>
          <View style={styles.fieldPicker}>
            <Picker
              selectedValue={props.modLoader}
              onValueChange={(value) => props.onChangeModLoader(value as PojlibModLoader)}
              mode={Platform.OS === 'android' ? 'dropdown' : undefined}
              style={styles.picker}
              dropdownIconColor={COLORS.accentBright}
            >
              {POJLIB_MOD_LOADERS.map((modLoader) => (
                <Picker.Item
                  key={modLoader}
                  label={modLoader}
                  value={modLoader}
                  color={COLORS.text}
                />
              ))}
            </Picker>
          </View>
          <View style={styles.modalActions}>
            <SecondaryButton label="Cancel" onPress={props.onCancel} />
            <PrimaryButton
              label="Create"
              disabled={!props.name.trim() || !props.version || props.busy}
              onPress={props.onCreate}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InspectModsModal(props: {
  instance: PojlibInstance | null;
  mods: PojlibProject[];
  busy: boolean;
  onClose: () => void;
  onRemove: (project: PojlibProject) => void;
}) {
  return (
    <Modal
      transparent
      visible={Boolean(props.instance)}
      animationType="fade"
      onRequestClose={props.onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.menuTitle}>
            Mods{props.instance ? ` • ${props.instance.instanceName}` : ''}
          </Text>
          {props.mods.length === 0 ? (
            <Text style={styles.muted}>No installed mods are registered for this instance.</Text>
          ) : (
            <ScrollView style={styles.menuScroll}>
              {props.mods.map((project) => (
                <View
                  key={`${project.slug}-${project.version ?? 'unknown'}`}
                  style={styles.projectRow}
                >
                  <View style={styles.projectTextWrap}>
                    <Text style={styles.projectTitle} numberOfLines={1}>
                      {formatProjectTitle(project)}
                    </Text>
                    <Text style={styles.projectMeta} numberOfLines={1}>
                      {(project.version ?? 'Unknown version') +
                        '  •  ' +
                        (project.fileName ?? 'Legacy file name')}
                    </Text>
                  </View>
                  <SecondaryButton
                    label="Delete"
                    disabled={props.busy}
                    onPress={() => props.onRemove(project)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.modalActions}>
            <SecondaryButton label="Close" onPress={props.onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InstallModModal(props: {
  pending: PendingModInstall | null;
  instances: PojlibInstance[];
  busy: boolean;
  onCancel: () => void;
  onChangeInstance: (name: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      transparent
      visible={Boolean(props.pending)}
      animationType="fade"
      onRequestClose={props.onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.menuTitle}>Install Mod</Text>
          {props.pending ? (
            <>
              <Text style={styles.fieldLabel}>
                You are about to install {props.pending.projectName} into{' '}
                {props.pending.instanceName}. Do you want to continue?
              </Text>
              <Text style={styles.muted}>
                {props.pending.fileName ?? props.pending.versionLabel}
              </Text>
              <Text style={styles.fieldLabel}>Target Instance</Text>
              <View style={styles.fieldPicker}>
                <Picker
                  selectedValue={props.pending.instanceName}
                  onValueChange={(value) => props.onChangeInstance(String(value))}
                  enabled={props.instances.length > 0}
                  mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                  style={styles.picker}
                  dropdownIconColor={COLORS.accentBright}
                >
                  {props.instances.map((instance) => (
                    <Picker.Item
                      key={instance.instanceName}
                      label={`${instance.instanceName} • ${instance.modLoader ?? 'Unknown'}`}
                      value={instance.instanceName}
                      color={COLORS.text}
                    />
                  ))}
                </Picker>
              </View>
            </>
          ) : null}
          <View style={styles.modalActions}>
            <SecondaryButton label="Cancel" onPress={props.onCancel} />
            <PrimaryButton label="Install" disabled={props.busy} onPress={props.onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Card(props: { children: React.ReactNode }) {
  return <View style={styles.card}>{props.children}</View>;
}

function PrimaryButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.primaryButton, props.disabled ? styles.primaryButtonDisabled : null]}
    >
      <Text style={styles.primaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function SecondaryButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.secondaryButton, props.disabled ? styles.secondaryButtonDisabled : null]}
    >
      <Text style={styles.secondaryButtonText}>{props.label}</Text>
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

function normalizeSupportedVersions(versions: string[] | null | undefined) {
  if (!Array.isArray(versions)) {
    return [...FALLBACK_SUPPORTED_VERSIONS];
  }

  const normalized = versions
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...FALLBACK_SUPPORTED_VERSIONS];
}

function createPendingInstall(
  instanceName: string,
  rawUrl: string,
  downloadName: string | null,
  pageUrl: string,
  pageTitle: string | null,
  imageUrl: string | null
): PendingModInstall | null {
  const normalizedPageUrl = normalizeBrowserUrl(pageUrl);
  const normalizedUrl = new URL(rawUrl, normalizedPageUrl).toString();
  if (!normalizedUrl.includes('cdn.modrinth.com/data/')) {
    return null;
  }

  const fileName =
    downloadName || decodeURIComponent(normalizedUrl.split('/').pop()?.split('?')[0] ?? '');
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
    iconUrl: normalizeInstanceImageUrl(imageUrl, normalizedPageUrl),
    type: inferProjectType(normalizedPageUrl),
  };
}

function normalizeInstanceImageUrl(
  imageUrl: string | null | undefined,
  baseUrl?: string | null
): string | null {
  const trimmed = imageUrl?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(https?:|file:|content:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return `file://${trimmed.replace(/\\/g, '/')}`;
  }

  if (trimmed.startsWith('/')) {
    return baseUrl ? new URL(trimmed, baseUrl).toString() : `file://${trimmed}`;
  }

  if (baseUrl) {
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return null;
    }
  }

  return null;
}

function getInstanceLogoSource(
  instance: Pick<PojlibInstance, 'instanceImageURL' | 'modLoader'> | null | undefined
): ImageSourcePropType | null {
  const customImage = normalizeInstanceImageUrl(instance?.instanceImageURL);
  if (customImage) {
    return { uri: customImage };
  }

  if (instance?.modLoader) {
    return INSTANCE_LOADER_ICONS[instance.modLoader] ?? null;
  }

  return null;
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
    backgroundColor: COLORS.bg,
  },
  shell: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },

  // Sidebar
  sidebar: {
    width: 264,
    backgroundColor: COLORS.sidebar,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: COLORS.borderSoft,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  avatarSmallImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  profileSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  navList: {
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: COLORS.accentSoft,
  },
  navGlyph: {
    color: COLORS.textMuted,
    fontSize: 18,
    width: 22,
    textAlign: 'center',
  },
  navGlyphActive: {
    color: COLORS.accentBright,
  },
  navLabel: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  navLabelActive: {
    color: COLORS.text,
  },
  sidebarSpacer: {
    flex: 1,
  },

  // Main
  main: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 18,
  },
  mainFullscreen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  topTabs: {
    flexDirection: 'row',
    gap: 28,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
    marginBottom: 18,
  },
  topTab: {
    paddingVertical: 12,
  },
  topTabLabel: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  topTabLabelActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  topTabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: COLORS.accentBright,
  },
  routeHeader: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
    marginBottom: 18,
    paddingVertical: 12,
  },
  routeHeaderTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 12,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: COLORS.danger,
    fontSize: 14,
    flex: 1,
  },
  errorBannerClose: {
    color: COLORS.danger,
    fontSize: 22,
    fontWeight: '700',
    paddingLeft: 12,
  },

  // Home / hero
  homeWrap: {
    flex: 1,
  },
  hero: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: COLORS.hero,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlowOne: {
    position: 'absolute',
    top: -80,
    left: -40,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: COLORS.accentGlow,
    opacity: 0.5,
  },
  heroGlowTwo: {
    position: 'absolute',
    bottom: -120,
    right: -60,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    opacity: 0.5,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 6,
    textShadowColor: COLORS.accentBright,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  heroTaglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
  },
  heroTagline: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
  },
  heroDiamond: {
    color: COLORS.accentBright,
    fontSize: 12,
  },

  // Play bar
  playBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 18,
  },
  versionSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 360,
  },
  versionIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: COLORS.heroDeep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  versionIconInner: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  versionText: {
    flex: 1,
  },
  versionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  versionSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  playButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 420,
  },
  playButtonDisabled: {
    backgroundColor: '#3a3350',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Sections / cards
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  card: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  muted: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  linkText: {
    color: COLORS.accentBright,
    fontSize: 13,
  },
  logLine: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },

  // Instances
  instanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  instanceCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.panelAlt,
  },
  instanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.heroDeep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  instanceLogo: {
    backgroundColor: COLORS.heroDeep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  instanceLogoImage: {
    width: '100%',
    height: '100%',
  },
  instanceInfo: {
    flex: 1,
  },
  instanceName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  instanceMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  instanceActions: {
    flexDirection: 'row',
    gap: 8,
  },

  // Placeholder (skins)
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  placeholderGlyph: {
    color: COLORS.accentBright,
    fontSize: 36,
  },
  placeholderTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // Download / Modrinth
  downloadWrap: {
    flex: 1,
    gap: 12,
  },
  downloadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  downloadControlHidden: {
    display: 'none',
  },
  downloadPicker: {
    width: 220,
    height: 48,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    overflow: 'hidden',
  },
  urlInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.text,
  },
  webViewShell: {
    flex: 1,
    position: 'relative',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    backgroundColor: COLORS.panel,
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.panel,
  },
  fullscreenFab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 10, 31, 0.92)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },
  fullscreenFabText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },

  // Settings
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  diagnosticRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 4,
  },
  diagnosticLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  diagnosticValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },

  // Busy pill
  busyPill: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.panelAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  busyPillText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },

  // Menus / modals
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 4, 12, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  accountMenu: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 22,
    gap: 12,
  },
  instanceMenu: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 22,
    gap: 12,
  },
  menuScroll: {
    maxHeight: 420,
  },
  menuTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  menuRowActive: {
    backgroundColor: COLORS.accentSoft,
  },
  menuRowInfo: {
    flex: 1,
  },
  menuRowText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  menuRowSub: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  menuCheck: {
    color: COLORS.accentBright,
    fontSize: 18,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 4, 12, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 24,
    gap: 12,
  },
  loginModalCard: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: 24,
    gap: 14,
  },
  loginModalMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  loginModalMessage: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  fieldLabel: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.heroDeep,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: COLORS.text,
  },
  fieldPicker: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.heroDeep,
    overflow: 'hidden',
    justifyContent: 'center',
    minHeight: 60,
  },
  picker: {
    color: COLORS.text,
    ...Platform.select({
      android: { height: 60, paddingHorizontal: 10 },
      ios: { height: 210 },
      default: {},
    }),
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.heroDeep,
    padding: 12,
    marginBottom: 8,
  },
  projectTextWrap: {
    flex: 1,
    gap: 3,
  },
  projectTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  projectMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
  },

  // Buttons
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#3a3350',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
