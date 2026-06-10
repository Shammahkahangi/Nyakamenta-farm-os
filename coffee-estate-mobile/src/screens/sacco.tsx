import React, { useState } from 'react';
import { Text, View, StyleSheet, Alert } from 'react-native';
import { dataService } from '../services/dataService';
import { useAsyncData } from '../hooks/useAsyncData';
import { Screen, Title, Subtitle, Card, Btn, Input, PillarTabs, Loading, Row, Kpi } from '../components/ui';
import { Fab } from '../components/Fab';
import { FormSheet, FormField } from '../components/FormSheet';

export function SaccoHubScreen() {
  const [tab, setTab] = useState('overview');
  const { data, loading, error, refresh } = useAsyncData(
    async () => ({
      summary: await dataService.getSaccoSummary(),
      members: await dataService.getSaccoMembers(),
      loans: await dataService.getSaccoLoans(),
      savings: await dataService.getSaccoSavings(),
      repayments: await dataService.getSaccoRepayments(),
    }),
    []
  );

  if (loading) return <Loading />;

  return (
    <Screen>
      <Title>SACCO</Title>
      <PillarTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'members', label: 'Members' },
          { id: 'loans', label: 'Loans' },
          { id: 'accounting', label: 'Accounting' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {tab === 'overview' && data?.summary && (
        <ViewKpis summary={data.summary} />
      )}
      {tab === 'members' && (
        <Card>
          {(data?.members as { id: number; full_name: string; member_no?: string }[])?.map((m) => (
            <Row key={m.id} label={m.full_name} value={m.member_no || ''} />
          ))}
          <AddMemberForm onDone={refresh} />
        </Card>
      )}
      {tab === 'loans' && (
        <LoansTab
          loans={data?.loans as { id: number; amount?: number; status?: string; member_name?: string }[]}
          members={data?.members as { id: number; full_name: string }[]}
          onDone={refresh}
        />
      )}
      {tab === 'accounting' && <SaccoAccountingTab />}
      <Btn label="Refresh" onPress={refresh} variant="ghost" />
    </Screen>
  );
}

function ViewKpis({ summary }: { summary: Record<string, unknown> }) {
  return (
    <View style={kpiStyles.row}>
      <Kpi label="Members" value={String(summary.members ?? 0)} />
      <Kpi label="Total savings" value={dataService.formatCurrency(summary.totalSavings || 0)} />
      <Kpi label="Loan book" value={dataService.formatCurrency(summary.totalLoanBook || 0)} />
      <Kpi label="Outstanding" value={dataService.formatCurrency(summary.outstandingLoans || 0)} />
    </View>
  );
}

const kpiStyles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });

function AddMemberForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [no, setNo] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <>
      <Fab onPress={() => setOpen(true)} label="Member" />
      <FormSheet
        visible={open}
        title="New SACCO member"
        onClose={() => setOpen(false)}
        saving={saving}
        onSubmit={async () => {
          setSaving(true);
          try {
            await dataService.addSaccoMember({
              full_name: name,
              member_no: no,
              phone,
              national_id: '',
              join_date: new Date().toISOString().slice(0, 10),
              status: 'Active',
            });
            setOpen(false);
            setName('');
            setNo('');
            onDone();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <FormField label="Full name">
          <Input value={name} onChangeText={setName} />
        </FormField>
        <FormField label="Member no">
          <Input value={no} onChangeText={setNo} />
        </FormField>
        <FormField label="Phone">
          <Input value={phone} onChangeText={setPhone} keyboardType="numeric" />
        </FormField>
      </FormSheet>
    </>
  );
}

function LoansTab({
  loans,
  members,
  onDone,
}: {
  loans?: { id: number; amount?: number; status?: string; member_name?: string }[];
  members?: { id: number; full_name: string }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [memberId, setMemberId] = useState('');
  const firstMember = members?.[0];
  return (
    <>
      <Card>
        {loans?.map((l) => (
          <Row key={l.id} label={l.member_name || `Loan ${l.id}`} value={`${dataService.formatCurrency(l.amount || 0)} · ${l.status}`} />
        ))}
      </Card>
      <Fab onPress={() => setOpen(true)} label="Loan" />
      <FormSheet
        visible={open}
        title="Issue loan"
        onClose={() => setOpen(false)}
        saving={saving}
        onSubmit={async () => {
          const mid = Number(memberId) || firstMember?.id;
          if (!mid) {
            Alert.alert('Add a member first');
            return;
          }
          setSaving(true);
          try {
            const today = new Date().toISOString().slice(0, 10);
            await dataService.addSaccoLoan({
              member_id: mid,
              amount: Number(amount) || 0,
              interest_rate: 12,
              term_months: 12,
              issue_date: today,
              due_date: today,
              status: 'Active',
            });
            setOpen(false);
            onDone();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <FormField label="Member ID">
          <Input
            value={memberId}
            onChangeText={setMemberId}
            placeholder={firstMember ? `Default: ${firstMember.id} ${firstMember.full_name}` : 'Member id'}
            keyboardType="numeric"
          />
        </FormField>
        <FormField label="Amount (UGX)">
          <Input value={amount} onChangeText={setAmount} keyboardType="numeric" />
        </FormField>
      </FormSheet>
    </>
  );
}

function SaccoAccountingTab() {
  const { data, loading, error } = useAsyncData(async () => {
    const from = `${new Date().getFullYear()}-01-01`;
    const to = new Date().toISOString().slice(0, 10);
    const [journal, cashbook, items] = await Promise.all([
      dataService.getSaccoJournalSummaryForRange(from, to),
      dataService.getSaccoCashbookForRange(from, to),
      dataService.getSaccoFinanceItems(),
    ]);
    return { journal, cashbook, items };
  }, []);
  if (loading) return <Loading />;
  return (
    <Card>
      <Subtitle>SACCO ledger (YTD)</Subtitle>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      <Row label="Journal lines" value={String((data?.journal as { lines?: unknown[] })?.lines?.length ?? 0)} />
      <Row label="Cashbook lines" value={String((data?.cashbook as { lines?: unknown[] })?.lines?.length ?? 0)} />
      {(data?.items as { id: number; description?: string; amount?: number; type?: string }[])
        ?.slice(0, 15)
        .map((i) => <Row key={i.id} label={i.description || ''} value={`${i.type} ${dataService.formatCurrency(i.amount || 0)}`} />)}
    </Card>
  );
}

export function SaccoReportsScreen() {
  const { data, loading, error } = useAsyncData(
    async () => {
      const [members, savings, loans, repayments, financeItems] = await Promise.all([
        dataService.getSaccoMembers(),
        dataService.getSaccoSavings(),
        dataService.getSaccoLoans(),
        dataService.getSaccoRepayments(),
        dataService.getSaccoFinanceItems(),
      ]);
      const totalSavings = (savings as { amount?: number }[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const totalLoanBook = (loans as { amount?: number }[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      const totalRepaid = (repayments as { amount?: number }[]).reduce((s, r) => s + Number(r.amount || 0), 0);
      return { members: members.length, totalSavings, totalLoanBook, outstanding: Math.max(totalLoanBook - totalRepaid, 0), financeItems };
    },
    []
  );
  if (loading) return <Loading />;
  return (
    <Screen>
      <Title>SACCO reports</Title>
      {error ? <Text style={{ color: '#f85149' }}>{error}</Text> : null}
      {data && (
        <>
          <Kpi label="Members" value={String(data.members)} />
          <Kpi label="Savings" value={dataService.formatCurrency(data.totalSavings)} />
          <Kpi label="Outstanding loans" value={dataService.formatCurrency(data.outstanding)} />
        </>
      )}
    </Screen>
  );
}
