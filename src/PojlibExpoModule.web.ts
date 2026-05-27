import { registerWebModule, NativeModule } from 'expo';

import { PojlibExpoModuleEvents } from './PojlibExpo.types';

class PojlibExpoModule extends NativeModule<PojlibExpoModuleEvents> {
  isPojlibBridgeAvailable() {
    return false;
  }

  getPojlibGitBranch() {
    return null;
  }

  async initialize() {
    throw new Error('Pojlib is only available on Android.');
  }

  async configure() {
    throw new Error('Pojlib is only available on Android.');
  }

  async getStatus() {
    throw new Error('Pojlib is only available on Android.');
  }

  async getSupportedVersions() {
    throw new Error('Pojlib is only available on Android.');
  }

  async hasConnection() {
    return false;
  }

  async listAccounts() {
    return [];
  }

  async login() {
    throw new Error('Pojlib is only available on Android.');
  }

  async removeAccount() {
    throw new Error('Pojlib is only available on Android.');
  }

  async loadInstances() {
    return [];
  }

  async getInstance() {
    return null;
  }

  async createInstance() {
    throw new Error('Pojlib is only available on Android.');
  }

  async createInstanceFromMrpack() {
    throw new Error('Pojlib is only available on Android.');
  }

  async deleteInstance() {
    throw new Error('Pojlib is only available on Android.');
  }

  async addExtraProject() {
    throw new Error('Pojlib is only available on Android.');
  }

  async addModrinthVersionProject() {
    throw new Error('Pojlib is only available on Android.');
  }

  async hasExtraProject() {
    return false;
  }

  async removeExtraProject() {
    throw new Error('Pojlib is only available on Android.');
  }

  async prelaunch() {
    throw new Error('Pojlib is only available on Android.');
  }

  async launchInstance() {
    throw new Error('Pojlib is only available on Android.');
  }

  async getDownloadStatus() {
    return { completed: true, percentage: 0 };
  }

  async readLatestLog() {
    return null;
  }
}

export default registerWebModule(PojlibExpoModule, 'PojlibExpo');
