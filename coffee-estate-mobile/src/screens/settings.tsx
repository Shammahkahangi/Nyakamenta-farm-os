import React, { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { isManagerRole } from '../auth/estateRole';
import { dataService } from '../services/dataService';
import { loadSettings, saveSettings, type EstateSettings } from '../storage/settings';
import { Screen, Title, Subtitle, Btn, Input } from '../components/ui';
import * as DocumentPicker from 'expo-document-picker';

export function DoorSettingsScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const [s, setS] = useState<EstateSettings>({});
  const [msg, setMsg] = useState('');

  React.useEffect(() => {
    loadSettings().then(setS);
  }, []);

  const email = user?.email || 'Signed in';

  return (
    <Screen>
      <Title>Settings</Title>
      <Subtitle>{email}</Subtitle>
      {isManagerRole() ? (
        <Subtitle>Estate-wide settings are available to owners only.</Subtitle>
      ) : (
        <>
          <Input value={s.estateName || ''} onChangeText={(t) => setS({ ...s, estateName: t })} placeholder="Estate name" />
          <Input value={s.location || ''} onChangeText={(t) => setS({ ...s, location: t })} placeholder="Location" />
          <Input value={s.currentSeason || ''} onChangeText={(t) => setS({ ...s, currentSeason: t })} placeholder="Season label" />
          <Btn label="Save profile" onPress={async () => { await saveSettings(s); setMsg('Saved'); }} />
          <Btn
            label="Sync with Supabase"
            variant="ghost"
            onPress={async () => {
              try {
                const r = (await dataService.sync()) as { success?: boolean; error?: string };
                setMsg(r.success ? 'Sync OK' : r.error || 'Sync failed');
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
            }}
          />
          <Btn
            label="Import payroll XLSX"
            variant="ghost"
            onPress={async () => {
              const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
              if (pick.canceled || !pick.assets?.[0]?.uri) return;
              const uri = pick.assets[0].uri;
              const b64 = await (await fetch(uri)).arrayBuffer().then((buf) => {
                const bytes = new Uint8Array(buf);
                let bin = '';
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                return btoa(bin);
              });
              await dataService.importPayrollFromXlsx({ xlsxBase64: b64, year: new Date().getFullYear() });
              setMsg('Payroll import submitted');
            }}
          />
        </>
      )}
      {msg ? <Text style={{ color: '#56d364', marginTop: 8 }}>{msg}</Text> : null}
      <Btn
        label="Sign out"
        variant="danger"
        onPress={() => signOut().then(() => router.replace('/(auth)/login'))}
      />
    </Screen>
  );
}
