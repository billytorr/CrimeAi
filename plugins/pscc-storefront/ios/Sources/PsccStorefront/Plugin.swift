import Foundation
import Capacitor
import StoreKit

// App Store storefront country for PaymentRegionPolicy (Guideline 3.1.1(a)
// region gate). StoreKit 2 only — NOT device locale, NOT IP geolocation:
// Apple evaluates external-purchase eligibility against the storefront, and
// locale is wrong for travelers/expats. Returns {} when unavailable, which
// the policy treats as blocked (fail closed).
@objc(PsccStorefront)
public class PsccStorefront: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PsccStorefront"
    public let jsName = "PsccStorefront"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCountry", returnType: CAPPluginReturnPromise),
    ]

    @objc func getCountry(_ call: CAPPluginCall) {
        Task {
            if let storefront = await Storefront.current {
                call.resolve(["code": storefront.countryCode])
            } else {
                call.resolve([:])
            }
        }
    }
}
