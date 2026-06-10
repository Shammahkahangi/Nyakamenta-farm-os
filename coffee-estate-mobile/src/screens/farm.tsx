import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { dataService } from '../services/dataService';
import { estateApi } from '../api/estateApi';
import { isOwnerOrAdmin } from '../auth/estateRole';
import { useAsyncData } from '../hooks/useAsyncData';
import { Screen, Title, Subtitle, Card, Btn, Input, PillarTabs, Loading, Row, Kpi } from '../components/ui';
import { RecordList } from '../components/RecordList';
import { FormField } from '../components/FormSheet';
import { Fab } from '../components/Fab';
import { FormSheet } from '../components/FormSheet';
import * as ImagePicker from 'expo-image-picker';

export function OwnerOverviewScreen() {
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [stats, finance, batches] = await Promise.all([
      dataService.getComputedStats(),
      dataService.getFinanceSummary(),
      dataService.getBatches(),
    ]);
    return { stats, finance, batches: (batches as { id: string; kgOut?: number; date?: string }[]).slice(0, 8) };
  }, []);
  const [tab, setTab] = useState('snapshot');

  if (loading) return <Loading />;
  if (error) return <Screen><Text style={{ color: '#f85149' }}>{error}</Text></Screen>;

  return (
    <Screen>
      <Title>Overview</Title>
      <PillarTabs
        tabs={[
          { id: 'snapshot', label: 'Snapshot' },
          { id: 'command', label: 'Command' },
          { id: 'blocks', label: 'Blocks' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'snapshot' && data && (
        <View style={styles.kpiRow}>
          <Kpi label="Net profit" value={dataService.formatCurrency(data.finance.netProfit)} />
          <Kpi label="Revenue" value={dataService.formatCurrency(data.finance.totalRevenue)} />
          <Kpi label="Expenses" value={dataService.formatCurrency(data.finance.totalExpenses)} />
          <Kpi label="Plants" value={String(data.stats?.totalPlants ?? '—')} />
        </View>
      )}
      {tab === 'command' && data && (
        <Card>
          <Subtitle>Recent batches</Subtitle>
          {data.batches.map((b) => (
            <Row key={b.id} label={b.id} value={`${Number(b.kgOut || 0).toLocaleString()} kg · ${b.date || ''}`} />
          ))}
        </Card>
      )}
      {tab === 'blocks' && <BlocksList />}
      <Btn label="Refresh" onPress={refresh} variant="ghost" />
    </Screen>
  );
}

function BlocksList() {
  const { data, loading, error } = useAsyncData(() => dataService.getBlocks(), []);
  if (loading) return <Loading />;
  if (error) return <Text style={{ color: '#f85149' }}>{error}</Text>;
  return (
    <Card>
      {(data as { id: string; name: string; acres?: number; plant_count?: number }[])?.map((b) => (
        <Row key={b.id} label={b.name} value={`${b.acres ?? 0} ac · ${b.plant_count ?? 0} plants`} />
      ))}
    </Card>
  );
}

export function ManagerOverviewScreen() {
  const { data, loading, error } = useAsyncData(async () => {
    const batches = await dataService.getBatches();
    return { batches: (batches as { id: string; kgOut?: number; date?: string; blockName?: string }[]).slice(0, 14) };
  }, []);
  if (loading) return <Loading />;
  return (
    <Screen>
      <Title>Manager dashboard</Title>
      <Subtitle>Operations only — no farm finance or SACCO</Subtitle>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {data?.batches.map((b) => (
        <Row key={b.id} label={b.blockName || b.id} value={`${Number(b.kgOut || 0).toLocaleString()} kg`} />
      ))}
    </Screen>
  );
}

export function FieldOpsScreen() {
  const [tab, setTab] = useState('workers');
  return (
    <Screen>
      <Title>Field Operations</Title>
      <PillarTabs
        tabs={[
          { id: 'workers', label: 'Workers' },
          { id: 'maintenance', label: 'Maintenance' },
          { id: 'irrigation', label: 'Irrigation' },
          { id: 'soil', label: 'Fertilizer' },
          { id: 'shade', label: 'Shade' },
          { id: 'stumping', label: 'Stumping' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'workers' && <WorkersTab />}
      {tab === 'maintenance' && <MaintenanceTab />}
      {tab === 'irrigation' && <IrrigationTab />}
      {tab === 'soil' && <SoilTab />}
      {tab === 'shade' && <SimpleListTab loader={() => dataService.getShadeTrees()} label="Shade" labelKey="species" />}
      {tab === 'stumping' && <SimpleListTab loader={() => dataService.getStumpingCycles()} label="Stumping" labelKey="blockName" />}
    </Screen>
  );
}

function WorkersTab() {
  const { data, loading, error } = useAsyncData(() => dataService.getWorkforce(), []);
  if (loading) return <Loading />;
  const deps = (data as { departments?: { id: number; name: string; payroll?: number }[] })?.departments || [];
  return (
    <Card>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {deps.map((w) => (
        <Row key={w.id} label={w.name} value={dataService.formatCurrency(w.payroll || 0)} />
      ))}
    </Card>
  );
}

function MaintenanceTab() {
  const { data, loading, error } = useAsyncData(() => dataService.getMaintenanceRateCard(), []);
  if (loading) return <Loading />;
  const lines = (data as { lines?: { activity_label: string; rate_ugx: number }[] })?.lines || data || [];
  const arr = Array.isArray(lines) ? lines : [];
  return (
    <Card>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {arr.map((l: { id?: number; activity_label?: string; rate_ugx?: number }, i: number) => (
        <Row key={l.id ?? i} label={l.activity_label || 'Activity'} value={dataService.formatCurrency(l.rate_ugx || 0)} />
      ))}
    </Card>
  );
}

function SimpleListTab({
  loader,
  label,
  labelKey = 'id',
  valueKey,
}: {
  loader: () => Promise<unknown[]>;
  label: string;
  labelKey?: string;
  valueKey?: string;
}) {
  const { data, loading, error } = useAsyncData(loader, [label]);
  if (loading) return <Loading />;
  return (
    <Card>
      <Subtitle>{`${label} records`}</Subtitle>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {(data as Record<string, unknown>[])?.map((r, i) => (
        <Row
          key={i}
          label={String(r[labelKey] ?? r.id ?? i)}
          value={valueKey ? String(r[valueKey] ?? '') : ''}
        />
      ))}
    </Card>
  );
}

function IrrigationTab() {
  const [method, setMethod] = useState('Drip');
  const [mm, setMm] = useState('5');
  const [notes, setNotes] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  return (
    <RecordList
      loader={() => dataService.getIrrigationLogs() as Promise<Record<string, unknown>[]>}
      title="Irrigation logs"
      addLabel="Log irrigation"
      labelKey={(r) => `${r.blockName || 'Block'} · ${r.log_date}`}
      valueKey={(r) => `${r.method} · ${r.mm_applied} mm`}
      form={
        <>
          <FormField label="Method">
            <Input value={method} onChangeText={setMethod} placeholder="Drip, sprinkler…" />
          </FormField>
          <FormField label="mm applied">
            <Input value={mm} onChangeText={setMm} keyboardType="numeric" placeholder="5" />
          </FormField>
          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} multiline placeholder="Optional notes" />
          </FormField>
        </>
      }
      onSave={async () => {
        await dataService.addIrrigationLog({
          block_id: null,
          log_date: today,
          method,
          mm_applied: Number(mm) || 0,
          rainfall_mm: 0,
          duration_hrs: 0,
          trigger_reason: 'Mobile',
          phenology_stage: '',
          notes,
          cost_ugx: 0,
        });
        setNotes('');
      }}
    />
  );
}

function SoilTab() {
  const [ph, setPh] = useState('5.2');
  const [om, setOm] = useState('3');
  const [notes, setNotes] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  return (
    <RecordList
      loader={() => dataService.getSoilRecords() as Promise<Record<string, unknown>[]>}
      title="Soil samples"
      addLabel="Add sample"
      labelKey={(r) => `${r.blockName || 'Block'} · ${r.sample_date}`}
      valueKey={(r) => `pH ${r.ph} · OM ${r.organic_matter_pct}%`}
      form={
        <>
          <FormField label="pH">
            <Input value={ph} onChangeText={setPh} keyboardType="numeric" />
          </FormField>
          <FormField label="Organic matter %">
            <Input value={om} onChangeText={setOm} keyboardType="numeric" />
          </FormField>
          <FormField label="Amendment notes">
            <Input value={notes} onChangeText={setNotes} multiline />
          </FormField>
        </>
      }
      onSave={async () => {
        await dataService.addSoilRecord({
          block_id: null,
          sample_date: today,
          ph: Number(ph) || 0,
          organic_matter_pct: Number(om) || 0,
          nitrogen_ppm: 0,
          phosphorus_ppm: 0,
          potassium_ppm: 0,
          cec: null,
          base_saturation_pct: null,
          texture: '',
          amendment_notes: notes,
        });
        setNotes('');
      }}
    />
  );
}

export function CropHealthScreen() {
  const { data, loading, error, refresh } = useAsyncData(() => dataService.getIpmRecords(), []);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pest, setPest] = useState('Coffee Berry Borer (CBB)');
  const [severity, setSeverity] = useState('3');
  const [notes, setNotes] = useState('');
  if (loading) return <Loading />;
  const records = data as { id: number; pest_type: string; severity_rating: number; blockName?: string }[];
  return (
    <Screen>
      <Title>Crop Health</Title>
      <Subtitle>IPM scouting — pests & diseases</Subtitle>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      <Card>
        {records?.map((r) => (
          <Row key={r.id} label={r.pest_type} value={`Sev ${r.severity_rating} · ${r.blockName || ''}`} />
        ))}
      </Card>
      <Fab onPress={() => setOpen(true)} label="Scout" />
      <FormSheet
        visible={open}
        title="New scout record"
        onClose={() => setOpen(false)}
        saving={saving}
        onSubmit={async () => {
          setSaving(true);
          try {
            await dataService.addIpmRecord({
              pest_type: pest,
              severity_rating: Number(severity),
              block_id: null,
              scout_date: new Date().toISOString().slice(0, 10),
              notes: notes || 'Mobile entry',
            });
            setOpen(false);
            refresh();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <FormField label="Pest / disease">
          <Input value={pest} onChangeText={setPest} placeholder="Pest type" />
        </FormField>
        <FormField label="Severity (1–5)">
          <Input value={severity} onChangeText={setSeverity} keyboardType="numeric" />
        </FormField>
        <FormField label="Notes">
          <Input value={notes} onChangeText={setNotes} multiline />
        </FormField>
      </FormSheet>
    </Screen>
  );
}

export function HarvestScreen() {
  const [tab, setTab] = useState('batches');
  const { data, loading, error, refresh } = useAsyncData(() => dataService.getBatches(), []);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [kg, setKg] = useState('');
  return (
    <Screen>
      <Title>Harvest & Processing</Title>
      <PillarTabs tabs={[{ id: 'batches', label: 'Batches' }, { id: 'processing', label: 'Post-harvest' }]} active={tab} onChange={setTab} />
      {tab === 'batches' && (
        <>
          {loading ? <Loading /> : null}
          {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
          <Card>
            {(data as { id: string; stage?: string; kgIn?: number; blockName?: string }[])?.map((b) => (
              <Row key={b.id} label={b.id} value={`${b.stage} · ${b.blockName} · ${b.kgIn} kg in`} />
            ))}
          </Card>
          <Fab onPress={() => setOpen(true)} label="Batch" />
          <FormSheet
            visible={open}
            title="New harvest batch"
            onClose={() => setOpen(false)}
            saving={saving}
            onSubmit={async () => {
              setSaving(true);
              try {
                const id = batchId.trim() || `B-${Date.now()}`;
                await dataService.addBatch({
                  id,
                  block_id: null,
                  stage: 'Picked',
                  kgIn: Number(kg) || 0,
                  moisture: 0,
                  status: 'Active',
                  date: new Date().toISOString().slice(0, 10),
                });
                setOpen(false);
                setBatchId('');
                setKg('');
                refresh();
              } catch (e) {
                Alert.alert('Error', e instanceof Error ? e.message : String(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            <FormField label="Batch ID">
              <Input value={batchId} onChangeText={setBatchId} placeholder="Auto if empty" />
            </FormField>
            <FormField label="Kg in">
              <Input value={kg} onChangeText={setKg} keyboardType="numeric" />
            </FormField>
          </FormSheet>
        </>
      )}
      {tab === 'processing' && <Subtitle>Post-harvest stages — use desktop for full processing workflow.</Subtitle>}
    </Screen>
  );
}

export function NurseryScreen() {
  const { data, loading, error } = useAsyncData(
    async () => ({ batches: await dataService.getNurseryBatches(), gardens: await dataService.getMotherGardens() }),
    []
  );
  if (loading) return <Loading />;
  return (
    <Screen>
      <Title>Nursery</Title>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      <Card>
        <Subtitle>Nursery batches</Subtitle>
        {(data?.batches as { id: string; stage?: string }[])?.map((b) => <Row key={b.id} label={b.id} value={b.stage || ''} />)}
      </Card>
      <Card>
        <Subtitle>Mother gardens</Subtitle>
        {(data?.gardens as { id: string; location?: string }[])?.map((g) => <Row key={g.id} label={g.id} value={g.location || ''} />)}
      </Card>
    </Screen>
  );
}

export function InventoryScreen() {
  const { data, loading, error, refresh } = useAsyncData(() => dataService.getInventory(), []);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('ea');
  if (loading) return <Loading />;
  return (
    <Screen>
      <Title>Inventory</Title>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      <Card>
        {(data as { id: number; name: string; quantity?: number; unit?: string }[])?.map((i) => (
          <Row key={i.id} label={i.name} value={`${i.quantity} ${i.unit || ''}`} />
        ))}
      </Card>
      <Fab onPress={() => setOpen(true)} label="Item" />
      <FormSheet
        visible={open}
        title="Add inventory item"
        onClose={() => setOpen(false)}
        saving={saving}
        onSubmit={async () => {
          setSaving(true);
          try {
            await dataService.addInventoryItem({
              name,
              category: 'Tool',
              unit,
              quantity: Number(qty) || 1,
              min_quantity: 0,
              condition: 'Good',
              location: 'Store',
              purchase_date: null,
              last_service: null,
              unit_value: 0,
              notes: '',
            });
            setOpen(false);
            setName('');
            refresh();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <FormField label="Name">
          <Input value={name} onChangeText={setName} placeholder="Item name" />
        </FormField>
        <FormField label="Quantity">
          <Input value={qty} onChangeText={setQty} keyboardType="numeric" />
        </FormField>
        <FormField label="Unit">
          <Input value={unit} onChangeText={setUnit} placeholder="ea, kg, L…" />
        </FormField>
      </FormSheet>
    </Screen>
  );
}

export function LogbookScreen() {
  const readOnly = isOwnerOrAdmin();
  const [tab, setTab] = useState('tasks');
  return (
    <Screen>
      <Title>{readOnly ? "Manager's logbook (review)" : 'Logbook'}</Title>
      <Subtitle>{readOnly ? 'Read-only for owners/admins' : 'Tasks, minutes, complaints'}</Subtitle>
      <PillarTabs
        tabs={[
          { id: 'tasks', label: 'Tasks' },
          { id: 'minutes', label: 'Minutes' },
          { id: 'complaints', label: 'Complaints' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'tasks' && <LogbookTasks readOnly={readOnly} />}
      {tab === 'minutes' && <LogbookMinutes readOnly={readOnly} />}
      {tab === 'complaints' && <LogbookComplaints readOnly={readOnly} />}
    </Screen>
  );
}

function LogbookTasks({ readOnly }: { readOnly: boolean }) {
  const { data, loading, error, refresh } = useAsyncData(() => dataService.getLogbookTasks(), []);
  const [title, setTitle] = useState('');
  if (loading) return <Loading />;
  return (
    <Card>
      {(data as { id: number; title: string; status?: string }[])?.map((t) => (
        <Row key={t.id} label={t.title} value={t.status || ''} />
      ))}
      {!readOnly && (
        <>
          <Input value={title} onChangeText={setTitle} placeholder="New task title" />
          <Btn label="Add task" onPress={async () => {
            await dataService.addLogbookTask({ title, priority: 'normal', details: '', due_date: null, block_id: null, worker_id: null });
            setTitle('');
            refresh();
          }} />
        </>
      )}
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
    </Card>
  );
}

function LogbookMinutes({ readOnly }: { readOnly: boolean }) {
  const { data, loading, error, refresh } = useAsyncData(() => dataService.getLogbookMinutes(), []);
  const [t, setT] = useState('');
  if (loading) return <Loading />;
  const upload = async () => {
    const pick = await ImagePicker.launchImageLibraryAsync({ base64: true });
    if (pick.canceled || !pick.assets[0]) return;
    const a = pick.assets[0];
    const minutes = data as { id: number }[];
    const parentId = minutes[0]?.id;
    if (!parentId) { Alert.alert('Add a minute record first'); return; }
    await dataService.uploadLogbookAttachment({
      parent_type: 'minute',
      parent_id: parentId,
      file: { base64: a.base64, mimeType: a.mimeType, name: a.fileName || 'photo.jpg' },
    });
    Alert.alert('Uploaded');
  };
  return (
    <Card>
      {(data as { id: number; title: string; meeting_date?: string }[])?.map((m) => (
        <Row key={m.id} label={m.title} value={m.meeting_date || ''} />
      ))}
      {!readOnly && (
        <>
          <Input value={t} onChangeText={setT} placeholder="Meeting title" />
          <Btn label="Add minute" onPress={async () => {
            await dataService.addLogbookMinute({ title: t, meeting_date: new Date().toISOString().slice(0, 10), attendees: '', topics: '', action_items: '' });
            setT(''); refresh();
          }} />
        </>
      )}
      <Btn label="Attach photo to first minute" onPress={upload} variant="ghost" />
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
    </Card>
  );
}

function LogbookComplaints({ readOnly }: { readOnly: boolean }) {
  const { data, loading, error, refresh } = useAsyncData(() => dataService.getLogbookComplaints(), []);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  if (loading) return <Loading />;
  return (
    <Card>
      {(data as { id: number; topic: string; status?: string }[])?.map((c) => (
        <Row key={c.id} label={c.topic} value={c.status || ''} />
      ))}
      {!readOnly && (
        <>
          <Input value={topic} onChangeText={setTopic} placeholder="Complaint topic" />
          <Input value={notes} onChangeText={setNotes} multiline placeholder="Details" />
          <Btn
            label="Add complaint"
            onPress={async () => {
              await dataService.addLogbookComplaint({
                incident_date: new Date().toISOString().slice(0, 10),
                reported_by: 'Manager',
                about_worker_id: null,
                about_block_id: null,
                topic,
                notes,
              });
              setTopic('');
              setNotes('');
              refresh();
            }}
          />
        </>
      )}
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
    </Card>
  );
}

export function SalesFinanceScreen() {
  const [tab, setTab] = useState('finance');
  const { data, loading, error, refresh } = useAsyncData(
    async () => ({ summary: await dataService.getFinanceSummary(), items: await dataService.getFinanceItems() }),
    []
  );
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'Expense' | 'Revenue'>('Expense');
  if (loading) return <Loading />;
  return (
    <Screen>
      <Title>Farm finance</Title>
      <PillarTabs tabs={[{ id: 'finance', label: 'Ledger' }, { id: 'sales', label: 'Sales' }]} active={tab} onChange={setTab} />
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {tab === 'finance' && data && (
        <>
          <View style={styles.kpiRow}>
            <Kpi label="Revenue" value={dataService.formatCurrency(data.summary.totalRevenue)} />
            <Kpi label="Expenses" value={dataService.formatCurrency(data.summary.totalExpenses)} />
            <Kpi label="Net" value={dataService.formatCurrency(data.summary.netProfit)} />
          </View>
          <Card>
            {(data?.items as { id: number; description?: string; amount?: number; type?: string }[])
              ?.slice(0, 30)
              .map((i) => (
                <Row key={i.id} label={i.description || ''} value={`${i.type} ${dataService.formatCurrency(i.amount || 0)}`} />
              ))}
          </Card>
          <Fab onPress={() => setOpen(true)} label="Entry" />
          <FormSheet
            visible={open}
            title="Ledger entry"
            onClose={() => setOpen(false)}
            saving={saving}
            onSubmit={async () => {
              setSaving(true);
              try {
                await dataService.addTransaction({
                  category: type === 'Expense' ? 'General expense' : 'Sales',
                  description: desc,
                  amount: Number(amount) || 0,
                  date: new Date().toISOString().slice(0, 10),
                  type,
                  payment_method: 'cash',
                  block_id: null,
                  maintenance_activity_key: null,
                  source_module: null,
                  source_id: null,
                });
                setOpen(false);
                setDesc('');
                refresh();
              } catch (e) {
                Alert.alert('Error', e instanceof Error ? e.message : String(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            <FormField label="Description">
              <Input value={desc} onChangeText={setDesc} />
            </FormField>
            <FormField label="Amount (UGX)">
              <Input value={amount} onChangeText={setAmount} keyboardType="numeric" />
            </FormField>
            <PillarTabs
              tabs={[{ id: 'Expense', label: 'Expense' }, { id: 'Revenue', label: 'Revenue' }]}
              active={type}
              onChange={(id) => setType(id as 'Expense' | 'Revenue')}
            />
          </FormSheet>
        </>
      )}
      {tab === 'sales' && <Subtitle>Domestic dispatch — mirror contracts from desktop sales tab.</Subtitle>}
    </Screen>
  );
}

export function AIInsightsScreen() {
  const [q, setQ] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Title>AI Insights</Title>
      <Input value={q} onChangeText={setQ} placeholder="Ask about the farm…" multiline />
      <Btn
        label={busy ? 'Thinking…' : 'Ask'}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const snap = await dataService.buildAIContextSnapshot();
            const out = await estateApi.openAIChat({
              messages: [
                { role: 'system', content: `Farm context:\n${snap}` },
                { role: 'user', content: q },
              ],
            });
            setReply(out.reply || out.message || JSON.stringify(out));
          } catch (e) {
            setReply(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      {reply ? <Card><Text style={styles.line}>{reply}</Text></Card> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { color: '#8b949e', fontSize: 12, marginBottom: 6 },
});
