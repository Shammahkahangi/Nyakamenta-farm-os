import React, { useState } from 'react';
import { Text, Alert } from 'react-native';
import { dataService } from '../services/dataService';
import { useAsyncData } from '../hooks/useAsyncData';
import { Screen, Title, Subtitle, Card, Loading, Row, Kpi, Input } from '../components/ui';
import { isManagerRole as isMgr } from '../auth/estateRole';
import { Fab } from '../components/Fab';
import { FormSheet, FormField } from '../components/FormSheet';

export function LodgeDashboardScreen() {
  const { data, loading, error, refresh } = useAsyncData(
    async () => ({
      summary: await dataService.getLodgeSummary(),
      units: await dataService.getLodgeUnits(),
      bookings: await dataService.getLodgeBookings(),
      payments: await dataService.getLodgePayments(),
    }),
    []
  );
  const [unitOpen, setUnitOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [guest, setGuest] = useState('');
  const [rate, setRate] = useState('150000');

  if (loading) return <Loading />;

  const units = data?.units as { id: number; code: string; name: string; status?: string; nightly_rate?: number }[];
  const bookings = data?.bookings as { id: number; guest_name: string; check_in?: string; unit_code?: string }[];

  return (
    <Screen>
      <Title>Lodge</Title>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {data?.summary && (
        <>
          <Kpi label="Units" value={String(data.summary.units)} />
          {!isMgr() && (
            <>
              <Kpi label="Revenue" value={dataService.formatCurrency(data.summary.revenue)} />
              <Kpi label="Net" value={dataService.formatCurrency(data.summary.net)} />
            </>
          )}
        </>
      )}
      <Subtitle>Units</Subtitle>
      {units?.map((u) => (
        <Row key={u.id} label={`${u.code} ${u.name}`} value={`${u.status} · ${dataService.formatCurrency(u.nightly_rate || 0)}/night`} />
      ))}
      <Subtitle>Bookings</Subtitle>
      {bookings?.map((b) => (
        <Row key={b.id} label={b.guest_name} value={`${b.unit_code || ''} · ${b.check_in || ''}`} />
      ))}
      <Fab onPress={() => setBookOpen(true)} label="Book" />
      <Fab onPress={() => setUnitOpen(true)} label="Unit" bottomOffset={64} />
      <FormSheet
        visible={unitOpen}
        title="Add lodge unit"
        onClose={() => setUnitOpen(false)}
        saving={saving}
        onSubmit={async () => {
          setSaving(true);
          try {
            await dataService.addLodgeUnit({
              code,
              name: code,
              capacity: 2,
              nightly_rate: Number(rate) || 150000,
              status: 'Available',
            });
            setUnitOpen(false);
            setCode('');
            refresh();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <FormField label="Unit code">
          <Input value={code} onChangeText={setCode} placeholder="L1" />
        </FormField>
        <FormField label="Nightly rate (UGX)">
          <Input value={rate} onChangeText={setRate} keyboardType="numeric" />
        </FormField>
      </FormSheet>
      <FormSheet
        visible={bookOpen}
        title="New booking"
        onClose={() => setBookOpen(false)}
        saving={saving}
        onSubmit={async () => {
          const u = units?.[0];
          if (!u) {
            Alert.alert('Add a unit first');
            return;
          }
          setSaving(true);
          try {
            await dataService.addLodgeBooking({
              guest_name: guest,
              guest_phone: '',
              unit_id: u.id,
              check_in: new Date().toISOString().slice(0, 10),
              check_out: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              guests_count: 1,
              booking_source: 'walk-in',
              status: 'Booked',
            });
            setBookOpen(false);
            setGuest('');
            refresh();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <FormField label="Guest name">
          <Input value={guest} onChangeText={setGuest} />
        </FormField>
        <Subtitle>{`Books first available unit: ${units?.[0]?.code || '—'}`}</Subtitle>
      </FormSheet>
    </Screen>
  );
}

export function LodgeReportsScreen() {
  const { data, loading, error } = useAsyncData(() => dataService.getLodgeSummary(), []);
  if (loading) return <Loading />;
  return (
    <Screen>
      <Title>Lodge reports</Title>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {data && (
        <>
          <Kpi label="Occupied" value={String(data.occupied)} />
          <Kpi label="Occupancy %" value={`${data.occupancyRate}%`} />
          <Kpi label="Bookings" value={String(data.bookings)} />
          <Kpi label="Revenue" value={dataService.formatCurrency(data.revenue)} />
          <Kpi label="Expenses" value={dataService.formatCurrency(data.expenses)} />
        </>
      )}
    </Screen>
  );
}
