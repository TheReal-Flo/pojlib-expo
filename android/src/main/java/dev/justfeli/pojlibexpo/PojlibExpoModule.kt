package dev.justfeli.pojlibexpo

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import pojlib.util.Constants
import pojlib.util.Logger

class PojlibExpoModule : Module() {
  private var logListenerAttached = false

  override fun definition() = ModuleDefinition {
    Name("PojlibExpo")

    Events("onLog")

    Function("isPojlibBridgeAvailable") {
      true
    }

    Function("getPojlibGitBranch") {
      Constants.GIT_BRANCH
    }

    AsyncFunction("initialize") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to initialize Pojlib."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.getStatus(activity)
    }

    AsyncFunction("configure") {
      model: String?,
      memoryValue: String?,
      developerMods: Boolean?,
      ignoreInstanceName: Boolean?,
      customRamValue: Boolean?,
      advancedDebugger: Boolean? ->

      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to configure Pojlib."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.configure(
        model,
        memoryValue,
        developerMods,
        ignoreInstanceName,
        customRamValue,
        advancedDebugger
      )
      PojlibBridge.getStatus(activity)
    }

    AsyncFunction("getStatus") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to read Pojlib status."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.getStatus(activity)
    }

    AsyncFunction("getSupportedVersions") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to query Pojlib supported versions."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.getSupportedVersions(activity)
    }

    AsyncFunction("hasConnection") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to query Pojlib connectivity."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.hasConnection(activity)
    }

    AsyncFunction("listAccounts") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to list Pojlib accounts."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.listAccounts(activity)
    }

    AsyncFunction("login") { accountUuid: String? ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to log into Pojlib."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.login(activity, accountUuid)
    }

    AsyncFunction("removeAccount") { uuid: String ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to remove a Pojlib account."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.removeAccount(activity, uuid)
    }

    AsyncFunction("loadInstances") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to load Pojlib instances."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.loadInstances(activity)
    }

    AsyncFunction("getInstance") { instanceName: String ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to read a Pojlib instance."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.getInstance(activity, instanceName)
    }

    AsyncFunction("createInstance") {
      instanceName: String,
      useDefaultMods: Boolean,
      minecraftVersion: String,
      modLoader: String,
      imageUrl: String? ->

      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to create a Pojlib instance."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.createInstance(
        activity,
        instanceName,
        useDefaultMods,
        minecraftVersion,
        modLoader,
        imageUrl
      )
    }

    AsyncFunction("createInstanceFromMrpack") {
      instanceName: String,
      imageUrl: String?,
      modLoader: String,
      mrpackFile: String ->

      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to create a Pojlib mrpack instance."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.createInstanceFromMrpack(
        activity,
        instanceName,
        imageUrl,
        modLoader,
        mrpackFile
      )
    }

    AsyncFunction("deleteInstance") { instanceName: String ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to delete a Pojlib instance."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.deleteInstance(activity, instanceName)
    }

    AsyncFunction("addExtraProject") {
      instanceName: String,
      name: String,
      fileName: String?,
      version: String,
      url: String,
      type: String ->

      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to add a Pojlib project."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.addExtraProject(
        activity,
        instanceName,
        name,
        fileName,
        version,
        url,
        type
      )
    }

    AsyncFunction("hasExtraProject") { instanceName: String, name: String ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to check a Pojlib project."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.hasExtraProject(activity, instanceName, name)
    }

    AsyncFunction("removeExtraProject") { instanceName: String, name: String ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to remove a Pojlib project."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.removeExtraProject(activity, instanceName, name)
    }

    AsyncFunction("prelaunch") { instanceName: String ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to prelaunch a Pojlib instance."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.prelaunch(activity, instanceName)
    }

    AsyncFunction("launchInstance") { instanceName: String, accountUuid: String? ->
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to launch a Pojlib instance."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.launchInstance(activity, instanceName, accountUuid)
    }

    AsyncFunction("getDownloadStatus") {
      PojlibBridge.getDownloadStatus()
    }

    AsyncFunction("readLatestLog") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to read the Pojlib log."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.readLatestLog(activity)
    }

    AsyncFunction("readPreviousLog") {
      val activity = requireNotNull(appContext.currentActivity) {
        "An Android activity is required to read the previous Pojlib log."
      }

      PojlibBridge.initialize(activity)
      attachLogListener()
      PojlibBridge.readPreviousLog(activity)
    }
  }

  private fun attachLogListener() {
    if (logListenerAttached) {
      return
    }

    Logger.getInstance().setLogListener(object : Logger.eventLogListener {
      override fun onEventLogged(text: String) {
        sendEvent("onLog", mapOf("message" to text))
      }
    })

    logListenerAttached = true
  }
}
