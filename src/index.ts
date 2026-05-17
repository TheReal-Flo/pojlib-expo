export { default } from './PojlibExpoModule';
export { default as PojlibExpoView } from './PojlibExpoView';
export * from './PojlibExpo.types';

import PojlibExpoModule, {
  AddPojlibProjectOptions,
  CreatePojlibInstanceOptions,
  CreatePojlibMrpackInstanceOptions,
  InstallDefaultPojlibInstanceOptions,
  PojlibConfig,
} from './PojlibExpoModule';

export const DEFAULT_POJLIB_MOD_LOADER = 'Fabric';

export function getDefaultPojlibInstanceName(
  minecraftVersion: string,
  modLoader: string = DEFAULT_POJLIB_MOD_LOADER
): string {
  return modLoader === DEFAULT_POJLIB_MOD_LOADER
    ? `QuestCraft ${minecraftVersion}`
    : `QuestCraft ${minecraftVersion} (${modLoader})`;
}

export function isPojlibBridgeAvailable(): boolean {
  return PojlibExpoModule.isPojlibBridgeAvailable();
}

export function getPojlibGitBranch(): string | null {
  return PojlibExpoModule.getPojlibGitBranch();
}

export function initializePojlib() {
  return PojlibExpoModule.initialize();
}

export function configurePojlib(config: PojlibConfig) {
  return PojlibExpoModule.configure(
    config.model ?? null,
    config.renderer ?? null,
    config.memoryValue ?? null,
    config.developerMods ?? null,
    config.ignoreInstanceName ?? null,
    config.customRAMValue ?? null,
    config.advancedDebugger ?? null
  );
}

export function getPojlibStatus() {
  return PojlibExpoModule.getStatus();
}

export function getPojlibSupportedVersions() {
  return PojlibExpoModule.getSupportedVersions();
}

export function hasPojlibConnection() {
  return PojlibExpoModule.hasConnection();
}

export function listPojlibAccounts() {
  return PojlibExpoModule.listAccounts();
}

export function loginToPojlib(accountUUID?: string | null) {
  return PojlibExpoModule.login(accountUUID ?? null);
}

export function removePojlibAccount(uuid: string) {
  return PojlibExpoModule.removeAccount(uuid);
}

export function loadPojlibInstances() {
  return PojlibExpoModule.loadInstances();
}

export function getPojlibInstance(instanceName: string) {
  return PojlibExpoModule.getInstance(instanceName);
}

export function createPojlibInstance(options: CreatePojlibInstanceOptions) {
  return PojlibExpoModule.createInstance(
    options.instanceName,
    options.useDefaultMods,
    options.minecraftVersion,
    options.modLoader,
    options.imageURL ?? null
  );
}

export async function installDefaultPojlibInstance(options: InstallDefaultPojlibInstanceOptions) {
  const supportedVersions = await getPojlibSupportedVersions();

  if (!supportedVersions.includes(options.minecraftVersion)) {
    throw new Error(
      `Minecraft version '${options.minecraftVersion}' is not in Pojlib's supported versions: ${supportedVersions.join(', ')}`
    );
  }

  const modLoader = options.modLoader ?? DEFAULT_POJLIB_MOD_LOADER;
  const instanceName =
    options.instanceName?.trim() || getDefaultPojlibInstanceName(options.minecraftVersion, modLoader);

  return createPojlibInstance({
    instanceName,
    useDefaultMods: true,
    minecraftVersion: options.minecraftVersion,
    modLoader,
    imageURL: options.imageURL ?? null,
  });
}

export function createPojlibInstanceFromMrpack(options: CreatePojlibMrpackInstanceOptions) {
  return PojlibExpoModule.createInstanceFromMrpack(
    options.instanceName,
    options.imageURL ?? null,
    options.modLoader,
    options.mrpackFile
  );
}

export function deletePojlibInstance(instanceName: string) {
  return PojlibExpoModule.deleteInstance(instanceName);
}

export function addPojlibExtraProject(options: AddPojlibProjectOptions) {
  return PojlibExpoModule.addExtraProject(
    options.instanceName,
    options.name,
    options.fileName ?? null,
    options.version,
    options.url,
    options.type
  );
}

export function hasPojlibExtraProject(instanceName: string, name: string) {
  return PojlibExpoModule.hasExtraProject(instanceName, name);
}

export function removePojlibExtraProject(instanceName: string, name: string) {
  return PojlibExpoModule.removeExtraProject(instanceName, name);
}

export function prelaunchPojlibInstance(instanceName: string) {
  return PojlibExpoModule.prelaunch(instanceName);
}

export function launchPojlibInstance(instanceName: string, accountUUID?: string | null) {
  return PojlibExpoModule.launchInstance(instanceName, accountUUID ?? null);
}

export function getPojlibDownloadStatus() {
  return PojlibExpoModule.getDownloadStatus();
}

export function readPojlibLatestLog() {
  return PojlibExpoModule.readLatestLog();
}

export function readPojlibPreviousLog() {
  return PojlibExpoModule.readPreviousLog();
}
