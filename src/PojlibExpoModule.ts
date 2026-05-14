import { NativeModule, requireNativeModule } from 'expo';

import type {
  AddPojlibProjectOptions,
  CreatePojlibInstanceOptions,
  CreatePojlibMrpackInstanceOptions,
  InstallDefaultPojlibInstanceOptions,
  PojlibAccount,
  PojlibConfig,
  PojlibDownloadStatus,
  PojlibExpoModuleEvents,
  PojlibInstance,
  PojlibStatus,
} from './PojlibExpo.types';

declare class PojlibExpoModule extends NativeModule<PojlibExpoModuleEvents> {
  isPojlibBridgeAvailable(): boolean;
  getPojlibGitBranch(): string | null;
  initialize(): Promise<PojlibStatus>;
  configure(
    model: string | null,
    memoryValue: string | null,
    developerMods: boolean | null,
    ignoreInstanceName: boolean | null,
    customRAMValue: boolean | null,
    advancedDebugger: boolean | null
  ): Promise<PojlibStatus>;
  getStatus(): Promise<PojlibStatus>;
  getSupportedVersions(): Promise<string[]>;
  hasConnection(): Promise<boolean>;
  listAccounts(): Promise<PojlibAccount[]>;
  login(accountUUID: string | null): Promise<PojlibStatus>;
  removeAccount(uuid: string): Promise<boolean>;
  loadInstances(): Promise<PojlibInstance[]>;
  getInstance(instanceName: string): Promise<PojlibInstance | null>;
  createInstance(
    instanceName: string,
    useDefaultMods: boolean,
    minecraftVersion: string,
    modLoader: string,
    imageURL: string | null
  ): Promise<PojlibInstance>;
  createInstanceFromMrpack(
    instanceName: string,
    imageURL: string | null,
    modLoader: string,
    mrpackFile: string
  ): Promise<PojlibInstance>;
  deleteInstance(instanceName: string): Promise<boolean>;
  addExtraProject(
    instanceName: string,
    name: string,
    fileName: string | null,
    version: string,
    url: string,
    type: string
  ): Promise<PojlibInstance>;
  hasExtraProject(instanceName: string, name: string): Promise<boolean>;
  removeExtraProject(instanceName: string, name: string): Promise<boolean>;
  prelaunch(instanceName: string): Promise<PojlibStatus>;
  launchInstance(instanceName: string, accountUUID: string | null): Promise<void>;
  getDownloadStatus(): Promise<PojlibDownloadStatus>;
  readLatestLog(): Promise<string | null>;
}

export type {
  AddPojlibProjectOptions,
  CreatePojlibInstanceOptions,
  CreatePojlibMrpackInstanceOptions,
  InstallDefaultPojlibInstanceOptions,
  PojlibConfig,
};

export default requireNativeModule<PojlibExpoModule>('PojlibExpo');
