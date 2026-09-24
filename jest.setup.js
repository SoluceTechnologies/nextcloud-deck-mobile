jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@nozbe/watermelondb/adapters/sqlite', () => ({
  __esModule: true,
  default: class SQLiteAdapterMock {
    constructor(options) {
      Object.assign(this, options);
    }
  },
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
}));

jest.mock('@/services/shared/nativeTlsTrust', () => {
  let pins = {};
  return {
    TlsTrust: {
      setPins: jest.fn((map) => { pins = map; }),
      __getPins: () => pins,
      request: jest.fn(async ({ url, method, headers, bodyBase64 }) => {
        const body = bodyBase64
          ? Buffer.from(bodyBase64, 'base64').toString('utf8')
          : undefined;
        const res = await global.fetch(url, { method, headers, body });
        let text = '';
        if (typeof res.text === 'function') text = await res.text();
        else if (typeof res.json === 'function') text = JSON.stringify(await res.json());
        const h = {};
        if (res.headers && typeof res.headers.forEach === 'function') {
          res.headers.forEach((v, k) => { h[k] = v; });
        } else if (res.headers && typeof res.headers.get === 'function') {
          // Handle mock headers with .get method (for tests)
          const headerNames = ['etag', 'content-type', 'content-length', 'retry-after', 'cache-control', 'expires'];
          for (const name of headerNames) {
            const val = res.headers.get(name);
            if (val) h[name] = val;
          }
        }
        const status = res.status ?? (res.ok === false ? 400 : 200);
        return {
          type: 'response',
          status,
          headers: h,
          bodyBase64: Buffer.from(text ?? '', 'utf8').toString('base64'),
        };
      }),
    },
  };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(function WebView(props, ref) {
      React.useImperativeHandle(ref, () => ({
        postMessage: () => {},
        reload: () => {},
      }));
      React.useEffect(() => {
        if (props.onMessage) {
          props.onMessage({
            nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
          });
        }
      }, [props.onMessage]);
      return React.createElement(View, { testID: 'web-view', ...props });
    }),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View, ScrollView, FlatList } = require('react-native');
  return {
    __esModule: true,
    default: { View, ScrollView, FlatList, createAnimatedComponent: (c) => c },
    View,
    ScrollView,
    createAnimatedComponent: (c) => c,
    useSharedValue: (v) => {
      const sv = { value: v };
      sv.modify = (updater) => {
        // The real modify() runs its modifier on the UI runtime, so a plain JS
        // closure is a Remote Function there and throws "Tried to synchronously
        // call a Remote Function". The worklets babel plugin runs under Jest,
        // so a `'worklet'` modifier carries __workletHash and a plain one does
        // not — reject the latter here or this mock silently accepts code that
        // crashes on device.
        if (updater && typeof updater.__workletHash !== 'number') {
          throw new Error(
            '[Worklets] Tried to synchronously call a Remote Function. ' +
              'SharedValue.modify() requires a worklet modifier.',
          );
        }
        sv.value = updater ? updater(sv.value) : sv.value;
      };
      return sv;
    },
    useAnimatedStyle: () => ({}),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
    useAnimatedScrollHandler: (h) => h,
    scrollTo: () => {},
    useEvent: () => null,
    withTiming: (v) => v,
    withSpring: (v) => v,
    LinearTransition: {},
    runOnJS: (fn) => (...args) => fn(...args),
  };
});
