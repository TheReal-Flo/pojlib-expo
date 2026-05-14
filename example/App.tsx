import { useEvent } from 'expo';
import { useEffect, useState } from 'react';
import PojlibExpo, {
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
  type PojlibStatus,
} from 'pojlib-expo';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

const POLL_INTERVAL_MS = 2000;
const MAX_LOG_LINES = 18;

export default function App() {
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

  const hasInstallingInstance = instances.some((instance) => !instance.classpath);

  useEffect(() => {
    void runAction('Initializing', async () => {
      await initializePojlib();
      await refreshAll();
    });
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
    const [nextStatus, nextAccounts, nextInstances, nextVersions, nextLog, nextPreviousLog] = await Promise.all([
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

  async function startLogin() {
    await loginToPojlib();
    await refreshAll();
  }

  async function installDefaultVersion(minecraftVersion: string) {
    await installDefaultPojlibInstance({ minecraftVersion });
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

    const payload = (await response.json()) as { success?: boolean; url?: string; error?: string };
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
          <Text style={styles.label}>Current profile: {status?.profileName ?? 'No account loaded'}</Text>
          <Text style={styles.label}>Microsoft login message: {status?.msaMessage || 'None'}</Text>
          {error ? <Text style={styles.error}>Error: {error}</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actions}>
            <ActionButton
              label="Initialize"
              onPress={() =>
                runAction('Initializing', async () => {
                  await initializePojlib();
                  await refreshAll();
                })
              }
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
              label="Start Login"
              onPress={() =>
                runAction('Starting login', async () => {
                  await startLogin();
                })
              }
            />
            <ActionButton
              label="Reload Accounts"
              onPress={() =>
                runAction('Loading accounts', async () => {
                  setAccounts(await listPojlibAccounts());
                  setStatus(await getPojlibStatus());
                })
              }
            />
            <ActionButton
              label="Reload Instances"
              onPress={() =>
                runAction('Loading instances', async () => {
                  setInstances(await loadPojlibInstances());
                })
              }
            />
            <ActionButton
              label="Reload Log File"
              onPress={() =>
                runAction('Reading log', async () => {
                  setLatestLog(await readPojlibLatestLog());
                  setPreviousLog(await readPojlibPreviousLog());
                })
              }
            />
            <ActionButton
              label="Install Latest Default"
              onPress={() =>
                runAction('Installing default instance', async () => {
                  const latestSupportedVersion = supportedVersions[0];
                  if (!latestSupportedVersion) {
                    throw new Error('No supported Pojlib versions are available yet.');
                  }

                  await installDefaultVersion(latestSupportedVersion);
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
                    await loginToPojlib(account.uuid);
                    await refreshAll();
                  })
                }
              />
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Instances</Text>
          {instances.length === 0 ? <Text style={styles.muted}>No instances found</Text> : null}
          {instances.map((instance) => (
            <View key={instance.instanceName} style={styles.instanceCard}>
              <Text style={styles.item}>
                {instance.instanceName} | {instance.versionName ?? 'Unknown version'} | {instance.extProjects.length} extra projects |{' '}
                {instance.classpath ? 'Ready' : 'Installing'}
              </Text>
              <View style={styles.actions}>
                <ActionButton
                  label="Prelaunch"
                  onPress={() =>
                    runAction(`Prelaunching ${instance.instanceName}`, async () => {
                      await prelaunchPojlibInstance(instance.instanceName);
                      await refreshAll();
                    })
                  }
                />
                <ActionButton
                  label="Launch"
                  onPress={() =>
                    runAction(`Launching ${instance.instanceName}`, async () => {
                      const selectedAccountUuid = status?.currentAccount?.uuid;
                      if (!selectedAccountUuid) {
                        throw new Error('Select an account before launching an instance.');
                      }

                      await launchPojlibInstance(instance.instanceName, selectedAccountUuid);
                    })
                  }
                />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Supported Versions</Text>
          <Text style={styles.muted}>
            {supportedVersions.length > 0 ? supportedVersions.join(', ') : 'No versions loaded'}
          </Text>
          <View style={styles.installRows}>
            {supportedVersions.slice(0, 6).map((version) => (
              <View key={version} style={styles.installRow}>
                <Text style={styles.item}>{version}</Text>
                <ActionButton
                  label="Install Default"
                  onPress={() =>
                    runAction(`Installing ${version}`, async () => {
                      await installDefaultVersion(version);
                    })
                  }
                />
              </View>
            ))}
          </View>
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
    </SafeAreaView>
  );
}

function ActionButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.button}>
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = {
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
    fontWeight: '700' as const,
    color: '#28322a',
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 10,
    fontWeight: '600' as const,
    color: '#3f3626',
  },
  label: {
    fontSize: 15,
    marginBottom: 8,
    color: '#28322a',
  },
  muted: {
    fontSize: 14,
    color: '#6b655b',
  },
  error: {
    marginTop: 8,
    color: '#8d1f1f',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  actions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  button: {
    backgroundColor: '#304c3d',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#f7f3e9',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  item: {
    fontSize: 14,
    marginBottom: 6,
    color: '#2d2d2d',
  },
  instanceCard: {
    marginBottom: 12,
  },
  installRows: {
    marginTop: 12,
    gap: 10,
  },
  installRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
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
};
