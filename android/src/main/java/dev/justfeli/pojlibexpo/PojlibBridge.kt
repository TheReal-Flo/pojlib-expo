package dev.justfeli.pojlibexpo

import android.app.Activity
import android.app.ActivityOptions
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import org.lwjgl.glfw.CallbackBridge
import pojlib.API
import pojlib.PojlibRuntimeHost
import pojlib.account.MinecraftAccount
import pojlib.util.Constants
import pojlib.util.FileUtil
import pojlib.util.GsonUtils
import pojlib.util.json.MinecraftInstances
import pojlib.util.json.ProjectInfo
import java.io.File

object PojlibBridge {
  fun initialize(activity: Activity) {
    Constants.initConstants(activity)
    initializeRuntimeHost(activity)

    try {
      CallbackBridge.nativeSetUseInputStackQueue(true)
    } catch (_: Throwable) {
      // The bridge still works without this when the native runtime is not active yet.
    }
  }

  fun configure(
    model: String?,
    memoryValue: String?,
    developerMods: Boolean?,
    ignoreInstanceName: Boolean?,
    customRamValue: Boolean?,
    advancedDebugger: Boolean?
  ) {
    model?.let { API.model = it }
    memoryValue?.let { API.memoryValue = it }
    developerMods?.let { API.developerMods = it }
    ignoreInstanceName?.let { API.ignoreInstanceName = it }
    customRamValue?.let { API.customRAMValue = it }
    advancedDebugger?.let { API.advancedDebugger = it }
  }

  fun getStatus(activity: Activity): Map<String, Any?> {
    initialize(activity)

    return mapOf(
      "bridgeAvailable" to true,
      "gitBranch" to Constants.GIT_BRANCH,
      "userHome" to Constants.USER_HOME,
      "filesDir" to activity.filesDir.absolutePath,
      "msaMessage" to API.msaMessage,
      "profileImage" to API.profileImage,
      "profileName" to API.profileName,
      "profileUUID" to API.profileUUID,
      "memoryValue" to API.memoryValue,
      "developerMods" to API.developerMods,
      "ignoreInstanceName" to API.ignoreInstanceName,
      "customRAMValue" to API.customRAMValue,
      "advancedDebugger" to API.advancedDebugger,
      "isDemoMode" to API.isDemoMode,
      "gameReady" to API.gameReady,
      "model" to API.model,
      "currentAccount" to API.currentAcc?.let { accountToMap(it) },
      "currentInstance" to API.currentInstance?.let { instanceToMap(it) }
    )
  }

  fun getSupportedVersions(activity: Activity): Array<String> {
    initialize(activity)
    return API.getQCSupportedVersions(activity)
  }

  fun hasConnection(activity: Activity): Boolean {
    initialize(activity)
    return API.hasConnection(activity)
  }

  fun listAccounts(activity: Activity): List<Map<String, Any?>> {
    initialize(activity)

    val accountDir = Constants.getAccountsDir()
    if (!accountDir.exists()) {
      return emptyList()
    }

    return accountDir.listFiles()
      ?.filter { it.isFile && it.extension.equals("json", ignoreCase = true) }
      ?.sortedBy { it.name }
      ?.mapNotNull { GsonUtils.jsonFileToObject(it.absolutePath, MinecraftAccount::class.java) }
      ?.map { accountToMap(it) }
      ?: emptyList()
  }

  fun login(activity: Activity, accountUuid: String?): Map<String, Any?> {
    initialize(activity)
    API.login(activity, accountUuid)
    return getStatus(activity)
  }

  fun removeAccount(activity: Activity, uuid: String): Boolean {
    initialize(activity)
    return API.removeAccount(activity, uuid)
  }

  fun loadInstances(activity: Activity): List<Map<String, Any?>> {
    initialize(activity)
    return loadInstancesModel().toArray().map { instanceToMap(it) }
  }

  fun getInstance(activity: Activity, instanceName: String): Map<String, Any?>? {
    initialize(activity)
    val instance = loadInstanceModel(loadInstancesModel(), instanceName) ?: return null
    return instanceToMap(instance)
  }

  fun createInstance(
    activity: Activity,
    instanceName: String,
    useDefaultMods: Boolean,
    minecraftVersion: String,
    modLoader: String,
    imageUrl: String?
  ): Map<String, Any?> {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = API.createNewInstance(
      activity,
      instances,
      instanceName,
      useDefaultMods,
      minecraftVersion,
      modLoader,
      imageUrl
    )
    GsonUtils.objectToJsonFile(Constants.USER_HOME + "/instances.json", instances)

    return instanceToMap(instance)
  }

  fun createInstanceFromMrpack(
    activity: Activity,
    instanceName: String,
    imageUrl: String?,
    modLoader: String,
    mrpackFile: String
  ): Map<String, Any?> {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = API.createNewInstance(
      activity,
      instances,
      instanceName,
      imageUrl,
      modLoader,
      mrpackFile
    )
    GsonUtils.objectToJsonFile(Constants.USER_HOME + "/instances.json", instances)

    return instanceToMap(instance)
  }

  fun deleteInstance(activity: Activity, instanceName: String): Boolean {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = requireInstance(loadInstanceModel(instances, instanceName), instanceName)
    return API.deleteInstance(instances, instance)
  }

  fun addExtraProject(
    activity: Activity,
    instanceName: String,
    name: String,
    fileName: String?,
    version: String,
    url: String,
    type: String
  ): Map<String, Any?> {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = requireInstance(loadInstanceModel(instances, instanceName), instanceName)
    API.addExtraProject(instances, instance, name, fileName, version, url, type)
    return instanceToMap(instance)
  }

  fun hasExtraProject(activity: Activity, instanceName: String, name: String): Boolean {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = requireInstance(loadInstanceModel(instances, instanceName), instanceName)
    return API.hasExtraProject(instance, name)
  }

  fun removeExtraProject(activity: Activity, instanceName: String, name: String): Boolean {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = requireInstance(loadInstanceModel(instances, instanceName), instanceName)
    return API.removeExtraProject(instances, instance, name)
  }

  fun prelaunch(activity: Activity, instanceName: String): Map<String, Any?> {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = requireInstance(loadInstanceModel(instances, instanceName), instanceName)
    API.prelaunch(activity, instances, instance)
    return getStatus(activity)
  }

  fun launchInstance(activity: Activity, instanceName: String, accountUuid: String?) {
    initialize(activity)
    val instances = loadInstancesModel()
    val instance = requireInstance(loadInstanceModel(instances, instanceName), instanceName)
    val account = resolveAccount(activity, accountUuid)
      ?: throw IllegalStateException("No account is currently loaded. Call login() first.")
    API.currentInstance = instance
    launchVrActivity(activity, instance.instanceName, account.uuid)
  }

  fun getDownloadStatus(): Map<String, Any> {
    return mapOf(
      "completed" to API.isDownloadsCompleted(),
      "percentage" to API.getDownloadPercentage().toDouble()
    )
  }

  fun readLatestLog(activity: Activity): String? {
    initialize(activity)
    val logFile = File(Constants.USER_HOME, "latestlog.txt")
    if (!logFile.exists()) {
      return null
    }

    return FileUtil.read(logFile.absolutePath)
  }

  private fun loadInstancesModel(): MinecraftInstances {
    return API.loadAll()
  }

  private fun loadInstanceModel(
    instances: MinecraftInstances,
    instanceName: String
  ): MinecraftInstances.Instance? {
    return API.load(instances, instanceName)
  }

  private fun initializeRuntimeHost(activity: Activity) {
    try {
      PojlibRuntimeHost.attachActivity(activity)
    } catch (_: Throwable) {
      // Runtime host setup is optional for non-launcher flows such as account and instance management.
    }
  }

  private fun resolveAccount(activity: Activity, accountUuid: String?): MinecraftAccount? {
    if (accountUuid == null) {
      return API.currentAcc
    }

    val account = MinecraftAccount.load(Constants.getAccountsDir().absolutePath, accountUuid)
    if (account != null) {
      API.currentAcc = account
      API.profileImage = MinecraftAccount.getSkinFaceUrl(account)
      API.profileName = account.username
      API.profileUUID = account.uuid
      API.isDemoMode = account.isDemoMode
    }

    return account
  }

  private fun launchVrActivity(activity: Activity, instanceName: String, accountUuid: String) {
    val intent = Intent(activity, PojlibVrActivity::class.java).apply {
      putExtra(PojlibVrActivity.EXTRA_INSTANCE_NAME, instanceName)
      putExtra(PojlibVrActivity.EXTRA_ACCOUNT_UUID, accountUuid)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

    val displayId = getMainDisplayId(activity)
    val options = ActivityOptions.makeBasic()
    if (displayId != -1) {
      options.launchDisplayId = displayId
    }

    activity.startActivity(intent, options.toBundle())
  }

  private fun getMainDisplayId(context: Context): Int {
    val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
      ?: return -1

    for (display in displayManager.displays) {
      if (display.displayId == android.view.Display.DEFAULT_DISPLAY) {
        return display.displayId
      }
    }

    return -1
  }

  private fun requireInstance(
    instance: MinecraftInstances.Instance?,
    instanceName: String
  ): MinecraftInstances.Instance {
    return instance ?: throw IllegalArgumentException("Instance '$instanceName' was not found.")
  }

  private fun accountToMap(account: MinecraftAccount): Map<String, Any?> {
    return mapOf(
      "uuid" to account.uuid,
      "username" to account.username,
      "isDemoMode" to account.isDemoMode,
      "expiresOn" to account.expiresOn.toDouble(),
      "userType" to account.userType,
      "skinFaceUrl" to MinecraftAccount.getSkinFaceUrl(account)
    )
  }

  private fun instanceToMap(instance: MinecraftInstances.Instance): Map<String, Any?> {
    return mapOf(
      "instanceName" to instance.instanceName,
      "instanceImageURL" to instance.instanceImageURL,
      "versionName" to instance.versionName,
      "versionType" to instance.versionType,
      "classpath" to instance.classpath,
      "gameDir" to instance.gameDir,
      "assetIndex" to instance.assetIndex,
      "assetsDir" to instance.assetsDir,
      "mainClass" to instance.mainClass,
      "defaultMods" to instance.defaultMods,
      "extProjects" to (instance.extProjects?.map(::projectToMap) ?: emptyList<Map<String, Any?>>())
    )
  }

  private fun projectToMap(project: ProjectInfo): Map<String, Any?> {
    return mapOf(
      "slug" to project.slug,
      "fileName" to project.fileName,
      "version" to project.version,
      "type" to project.type,
      "downloadLink" to project.download_link
    )
  }
}
