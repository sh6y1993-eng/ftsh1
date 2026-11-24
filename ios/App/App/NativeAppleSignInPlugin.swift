import Foundation
import UIKit
import AuthenticationServices
import CryptoKit
import Capacitor

/// Custom Capacitor Bridge ViewController that registers the built-in native Apple Sign-In plugin
@objc(AppViewController)
public class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        if bridge?.plugin(withName: "NativeAppleSignIn") == nil {
            bridge?.registerPluginInstance(NativeAppleSignInPlugin())
        }
    }
}

/// Native Sign in with Apple plugin using AuthenticationServices (Face ID / Touch ID iOS system sheet)
@objc(NativeAppleSignInPlugin)
public class NativeAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "NativeAppleSignInPlugin"
    public let jsName = "NativeAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var currentRawNonce: String?

    @objc public func authorize(_ call: CAPPluginCall) {
        if pendingCall != nil {
            call.reject("توجد عملية تسجيل دخول قيد التنفيذ حالياً", "IN_PROGRESS")
            return
        }

        let rawNonce = Self.randomNonceString()
        let hashedNonce = Self.sha256(rawNonce)
        self.pendingCall = call
        self.currentRawNonce = rawNonce

        DispatchQueue.main.async {
            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = hashedNonce

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let activeWindow = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) {
            return activeWindow
        }
        if let bridgeWindow = self.bridge?.viewController?.view.window {
            return bridgeWindow
        }
        return ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let call = pendingCall else { return }
        let rawNonce = currentRawNonce ?? ""
        pendingCall = nil
        currentRawNonce = nil

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("تعذر قراءة بيانات حساب Apple من الجهاز", "INVALID_CREDENTIAL")
            return
        }

        let identityToken: String = {
            guard let data = credential.identityToken,
                  let tokenStr = String(data: data, encoding: .utf8) else {
                return ""
            }
            return tokenStr
        }()

        let authorizationCode: String = {
            guard let data = credential.authorizationCode,
                  let codeStr = String(data: data, encoding: .utf8) else {
                return ""
            }
            return codeStr
        }()

        let givenName = credential.fullName?.givenName ?? ""
        let familyName = credential.fullName?.familyName ?? ""
        let fullName = [givenName, familyName]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        call.resolve([
            "user": credential.user,
            "email": credential.email ?? "",
            "givenName": givenName,
            "familyName": familyName,
            "fullName": fullName,
            "identityToken": identityToken,
            "authorizationCode": authorizationCode,
            "rawNonce": rawNonce
        ])
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        currentRawNonce = nil

        let nsError = error as NSError
        if nsError.domain == ASAuthorizationError.errorDomain,
           let authError = ASAuthorizationError.Code(rawValue: nsError.code) {
            switch authError {
            case .canceled:
                call.reject("تم إلغاء تسجيل الدخول بحساب Apple", "CANCELED")
                return
            case .unknown, .invalidResponse, .notHandled, .failed, .notInteractive:
                call.reject("تعذر إتمام تسجيل الدخول بحساب Apple (تأكد من تفعيل Sign in with Apple في Xcode وتوقيع التطبيق بحساب المطور).", "APPLE_AUTH_FAILED_\(nsError.code)")
                return
            @unknown default:
                break
            }
        }

        call.reject(error.localizedDescription, "APPLE_AUTH_ERROR")
    }

    private static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        if errorCode != errSecSuccess {
            return UUID().uuidString.replacingOccurrences(of: "-", with: "")
        }
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(randomBytes.map { byte in
            charset[Int(byte) % charset.count]
        })
    }

    private static func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.compactMap { String(format: "%02x", $0) }.joined()
    }
}
