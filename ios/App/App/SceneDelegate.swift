import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        if self.window == nil {
            let bridgeVC = AppViewController()
            let newWindow = UIWindow(windowScene: windowScene)
            newWindow.rootViewController = bridgeVC
            newWindow.makeKeyAndVisible()
            self.window = newWindow

            bridgeVC.loadViewIfNeeded()
            if bridgeVC.bridge?.plugin(withName: "NativeAppleSignIn") == nil {
                bridgeVC.bridge?.registerPluginInstance(NativeAppleSignInPlugin())
            }
        } else if let bridgeVC = self.window?.rootViewController as? CAPBridgeViewController {
            bridgeVC.loadViewIfNeeded()
            if bridgeVC.bridge?.plugin(withName: "NativeAppleSignIn") == nil {
                bridgeVC.bridge?.registerPluginInstance(NativeAppleSignInPlugin())
            }
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
