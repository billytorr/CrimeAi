// JS bridge for the in-repo storefront plugin. The app resolves the plugin by
// name; this module just re-exports the registered proxy.
var core = require("@capacitor/core");
exports.PsccStorefront = core.registerPlugin("PsccStorefront");
