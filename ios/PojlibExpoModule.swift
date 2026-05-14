import ExpoModulesCore

public class PojlibExpoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PojlibExpo")

    Function("isPojlibBridgeAvailable") { () -> Bool in
      false
    }

    Function("getPojlibGitBranch") { () -> String? in
      nil
    }
  }
}
