// Type side of the jest-native matchers that package.json's jest
// `setupFilesAfterEnv` already installs at runtime; `declare global`
// makes them typed in every test once this file is in the tsc program.
import '@testing-library/jest-native/extend-expect';
