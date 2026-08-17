/**
 * config.js — Maps Lead Pro (Botzap Super CRM / LeadsBooster)
 * Aponta pro projeto Lovable Cloud do painel.
 */
window.EXT_CONFIG = {
    APP_NAME: "Maps Lead Pro",
    LICENSE_PREFIX: "MPL",
    LICENSE_ENABLED: true,
    LICENSE_API_BASE: "https://tzrqcmkdkljxjkrekbyx.supabase.co/functions/v1",
    LICENSE_VALIDATE_PATH: "/extension-license",
    LICENSE_WEBHOOK_PATH: "/webhook-maps-extension",
    LICENSE_STORAGE_KEY: "mpl_license_key",
    LICENSE_DEVICE_KEY: "mpl_device_fingerprint",
    LICENSE_LAST_VALIDATED_KEY: "mpl_last_validated_at",
    REVALIDATE_AFTER_MS: 6 * 60 * 60 * 1000,
    AUTO_SYNC_ENABLED: true,
    UPDATE_CHECK_ENABLED: false,
    UPDATE_CHECK_URL: "",
    UPDATE_DOWNLOAD_URL: ""
};
