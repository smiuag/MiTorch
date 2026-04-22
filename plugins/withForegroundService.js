const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const SERVICE_NAMES = [
  'com.supersami.foregroundservice.ForegroundService',
  'com.supersami.foregroundservice.ForegroundServiceTask',
];

function withForegroundService(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.service = application.service || [];

    for (const name of SERVICE_NAMES) {
      const exists = application.service.some(
        (s) => s.$ && s.$['android:name'] === name
      );
      if (!exists) {
        application.service.push({
          $: {
            'android:name': name,
            'android:foregroundServiceType': 'dataSync',
          },
        });
      }
    }

    return cfg;
  });
}

module.exports = withForegroundService;
