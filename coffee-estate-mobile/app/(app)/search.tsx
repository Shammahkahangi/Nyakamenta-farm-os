import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { dataService } from '../../src/services/dataService';
import { Screen, Title, Input, Btn, Card, Row, Loading } from '../../src/components/ui';

export default function SearchScreen() {
  const { door } = useLocalSearchParams<{ door?: string }>();
  const d = (door as 'farm' | 'sacco' | 'lodge') || 'farm';
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ group: string; label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const all = await dataService.getMetricSearchIndex(d);
      const t = q.trim().toLowerCase();
      const filtered = t
        ? all.filter((i: { tokens: string }) => i.tokens.includes(t))
        : all;
      setItems(filtered.slice(0, 40));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>Metric search</Title>
      <Input value={q} onChangeText={setQ} placeholder="Search KPIs…" />
      <Btn label="Search" onPress={run} />
      {loading ? <Loading /> : null}
      <Card>
        {items.map((i, idx) => (
          <Row key={idx} label={`${i.group}: ${i.label}`} value={i.value} />
        ))}
      </Card>
    </Screen>
  );
}
