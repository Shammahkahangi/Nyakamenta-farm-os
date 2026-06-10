import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'estate_settings';

export type EstateSettings = {
  estateName?: string;
  location?: string;
  currentSeason?: string;
  managerName?: string;
  managerRole?: string;
  theme?: 'dark' | 'light';
};

export async function loadSettings(): Promise<EstateSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveSettings(patch: EstateSettings) {
  const cur = await loadSettings();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...cur, ...patch }));
}
