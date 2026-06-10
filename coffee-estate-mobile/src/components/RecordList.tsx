import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useAsyncData } from '../hooks/useAsyncData';
import { Card, Subtitle, Row, Loading } from './ui';
import { Fab } from './Fab';
import { FormSheet } from './FormSheet';
import { colors } from '../theme/colors';

type RecordListProps<T extends Record<string, unknown>> = {
  loader: () => Promise<T[]>;
  labelKey: keyof T | ((row: T) => string);
  valueKey?: keyof T | ((row: T) => string);
  title: string;
  emptyLabel?: string;
  canAdd?: boolean;
  addLabel?: string;
  form: React.ReactNode;
  onSave: () => Promise<void>;
};

export function RecordList<T extends Record<string, unknown>>({
  loader,
  labelKey,
  valueKey,
  title,
  emptyLabel = 'No records yet',
  canAdd = true,
  addLabel = 'Add',
  form,
  onSave,
}: RecordListProps<T>) {
  const { data, loading, error, refresh } = useAsyncData(loader, [title]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const label = (row: T) =>
    typeof labelKey === 'function' ? labelKey(row) : String(row[labelKey] ?? '—');
  const value = (row: T) => {
    if (!valueKey) return '';
    return typeof valueKey === 'function' ? valueKey(row) : String(row[valueKey] ?? '');
  };

  if (loading) return <Loading />;

  return (
    <View>
      <Card>
        <Subtitle>{title}</Subtitle>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {!data?.length ? <Text style={styles.empty}>{emptyLabel}</Text> : null}
        {data?.map((row, i) => (
          <Row key={String(row.id ?? i)} label={label(row)} value={value(row)} />
        ))}
      </Card>
      {canAdd ? (
        <>
          <Fab onPress={() => setOpen(true)} label={addLabel} />
          <FormSheet
            visible={open}
            title={addLabel}
            onClose={() => setOpen(false)}
            saving={saving}
            onSubmit={async () => {
              setSaving(true);
              try {
                await onSave();
                setOpen(false);
                refresh();
              } catch (e) {
                Alert.alert('Error', e instanceof Error ? e.message : String(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {form}
          </FormSheet>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  err: { color: colors.redText, marginBottom: 8 },
  empty: { color: colors.textMuted, fontSize: 13, marginVertical: 8 },
});
