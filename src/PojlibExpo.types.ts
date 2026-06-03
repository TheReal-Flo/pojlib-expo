import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type PojlibLogEventPayload = {
  message: string;
};

export type PojlibProject = {
  slug: string;
  fileName: string | null;
  version: string | null;
  type: string;
  downloadLink: string | null;
};

export type PojlibModLoader = 'Fabric' | 'NeoForge' | 'Quilt' | 'Forge';

export type PojlibInstance = {
  instanceName: string;
  instanceImageURL: string | null;
  versionName: string | null;
  versionType: string | null;
  classpath: string | null;
  gameDir: string | null;
  assetIndex: string | null;
  assetsDir: string | null;
  mainClass: string | null;
  modLoader: PojlibModLoader | null;
  defaultMods: boolean;
  extProjects: PojlibProject[];
};

export type PojlibAccount = {
  uuid: string;
  username: string;
  isDemoMode: boolean;
  expiresOn: number;
  userType: string;
  skinFaceUrl: string | null;
};

export type PojlibStatus = {
  bridgeAvailable: boolean;
  gitBranch: string | null;
  userHome: string | null;
  filesDir: string | null;
  msaMessage: string;
  profileImage: string | null;
  profileName: string | null;
  profileUUID: string | null;
  memoryValue: string;
  developerMods: boolean;
  ignoreInstanceName: boolean;
  customRAMValue: boolean;
  advancedDebugger: boolean;
  isDemoMode: boolean;
  gameReady: boolean;
  model: string;
  renderer: string;
  currentAccount: PojlibAccount | null;
  currentInstance: PojlibInstance | null;
};

export type PojlibDownloadStatus = {
  completed: boolean;
  percentage: number;
};

export type PojlibConfig = {
  model?: string | null;
  renderer?: string | null;
  memoryValue?: string | null;
  developerMods?: boolean | null;
  ignoreInstanceName?: boolean | null;
  customRAMValue?: boolean | null;
  advancedDebugger?: boolean | null;
};

export type CreatePojlibInstanceOptions = {
  instanceName: string;
  useDefaultMods: boolean;
  minecraftVersion: string;
  modLoader: PojlibModLoader;
  imageURL?: string | null;
};

export type InstallDefaultPojlibInstanceOptions = {
  minecraftVersion: string;
  instanceName?: string | null;
  modLoader?: PojlibModLoader | null;
  imageURL?: string | null;
};

export type CreatePojlibMrpackInstanceOptions = {
  instanceName: string;
  imageURL?: string | null;
  modLoader: PojlibModLoader;
  mrpackFile: string;
};

export type AddPojlibProjectOptions = {
  instanceName: string;
  name: string;
  fileName?: string | null;
  version: string;
  url: string;
  type: string;
};

export type AddPojlibModrinthVersionOptions = {
  instanceName: string;
  versionId: string;
  type?: string | null;
};

export type PojlibExpoModuleEvents = {
  onLog: (params: PojlibLogEventPayload) => void;
};

export type PojlibExpoViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
