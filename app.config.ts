import type {ExpoConfig} from 'expo/config';
import {version} from './package.json';

const [major, minor, patch] = version.split('.').map(Number);

if (![major, minor, patch].every(Number.isInteger)) {
    throw new Error(
        `package.json: version "${version}" invalid`,
    );
}

const versionCode = 100;

if (versionCode !== major * 10000 + minor * 100 + patch) {
    throw new Error(
        `app.config.ts: versionCode ${versionCode} does not match version "${version}" ` +
        `(expected ${major * 10000 + minor * 100 + patch})`,
    );
}

const config: ExpoConfig = {
    name: 'Nextcloud Deck',
    slug: 'nextcloud-deck',
    scheme: 'nextcloud-deck',
    version,
    orientation: 'default',
    userInterfaceStyle: 'automatic',
    platforms: ['ios', 'android'],
    icon: './assets/icon.png',
    assetBundlePatterns: ['**/*'],

    ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.soluce.nextcloud-deck',
        icon: './assets/icon-ios.icon',
        infoPlist: {
            CFBundleDisplayName: 'Nextcloud Deck',
            ITSAppUsesNonExemptEncryption: false,
            NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: true,
            },
        },
    },

    android: {
        package: 'com.soluce.nextclouddeck',
        versionCode,
        adaptiveIcon: {
            foregroundImage: './assets/adaptive-icon.png',
            backgroundColor: '#109be6',
        },
        softwareKeyboardLayoutMode: 'resize',
    },

    web: {
        favicon: './assets/favicon.png',
    },

    extra: {
        eas: {
            projectId: '62202980-0da4-4706-ac4f-c83223d85bb9',
        },
    },

    owner: 'soluce',

    plugins: [
        './plugins/withAndroidNetworkSecurityConfig',
        '@morrowdigital/watermelondb-expo-plugin',
        '@react-native-community/datetimepicker',
        'expo-router',
        'expo-secure-store',
        'expo-web-browser',
        [
            'expo-camera',
            {
                cameraPermission:
                    'Allow Deck to access the camera to scan a Nextcloud login QR code.',
            },
        ],
        [
            'expo-splash-screen',
            {
                image: './assets/splash-icon.png',
                imageWidth: 200,
                resizeMode: 'contain',
                backgroundColor: '#0082c9',
                dark: {
                    backgroundColor: '#0082c9',
                },
            },
        ],
        'expo-localization',
        'expo-status-bar',
        'expo-font',
    ],
};

export default config;
