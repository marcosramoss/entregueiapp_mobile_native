import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { Banknote, CalendarDays, ChevronLeft, ChevronRight, PackageCheck } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getDailyRateDates, getDeliveries, getSettings, getWorkShifts } from '../database';
import {
  addDays,
  dateFromKey,
  formatDate,
  formatMoney,
  mondayOfWeek,
  todayKey,
} from '../domain';
import type { Delivery, WorkShift } from '../domain';
import { useSelectedDate } from '../context/SelectedDateContext';

type Period = 'week' | 'month';

type DayEarnings = {
  date: string;
  deliveries: Delivery[];
  deliveryTotal: number;
  dailyRate: number;
  workShifts: WorkShift[];
  total: number;
};

type ChartBar = {
  key: string;
  label: string;
  total: number;
  description: string;
};

const colors = {
  background: '#0b1220',
  panel: '#111c2e',
  text: '#edf2f7',
  muted: '#91a0b5',
  line: '#263449',
  green: '#22c55e',
  greenLight: '#4ade80',
  greenSoft: '#123624',
  red: '#f87171',
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

function periodBounds(dateKey: string, period: Period): [string, string] {
  if (period === 'week') {
    const start = mondayOfWeek(dateKey);
    return [start, addDays(start, 6)];
  }
  const date = dateFromKey(dateKey);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return [todayKey(start), todayKey(end)];
}

function shiftMonth(dateKey: string, amount: number): string {
  const date = dateFromKey(dateKey);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return todayKey(date);
}

function compactMoney(cents: number): string {
  const amount = cents / 100;
  if (amount >= 1000) {
    return `R$ ${(amount / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${amount.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

function Heading({ children, icon: Icon }: { children: React.ReactNode; icon: typeof Banknote }) {
  return (
    <View style={styles.headingRow}>
      <Icon size={18} color={colors.greenLight} />
      <Text style={styles.heading}>{children}</Text>
    </View>
  );
}

export default function EarningsScreen() {
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [period, setPeriod] = useState<Period>('week');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [dailyRateDates, setDailyRateDates] = useState<string[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [dailyRateCents, setDailyRateCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [startDate, endDate] = periodBounds(selectedDate, period);

  const refresh = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [deliveryData, dailyRateDateData, shiftData, settings] = await Promise.all([
        getDeliveries(startDate, endDate),
        getDailyRateDates(startDate, endDate),
        getWorkShifts(startDate, endDate),
        getSettings(),
      ]);
      if (!isActive()) return;
      setDeliveries(deliveryData);
      setDailyRateDates(dailyRateDateData);
      setWorkShifts(shiftData);
      setDailyRateCents(settings.dailyRateCents);
    } catch (error) {
      if (isActive()) setLoadError(errorText(error));
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [startDate, endDate]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void refresh(() => active);
    return () => {
      active = false;
    };
  }, [refresh]));

  const days = useMemo(() => {
    const deliveriesByDate = new Map<string, Delivery[]>();
    for (const delivery of deliveries) {
      const current = deliveriesByDate.get(delivery.date) ?? [];
      current.push(delivery);
      deliveriesByDate.set(delivery.date, current);
    }

    const result: DayEarnings[] = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      const dayDeliveries = deliveriesByDate.get(date) ?? [];
      const deliveryTotal = dayDeliveries.reduce((sum, item) => sum + item.priceCents, 0);
      const dayShifts = workShifts.filter((shift) => shift.date === date);
      const dailyRate = (dailyRateDates.includes(date) ? dailyRateCents : 0)
        + dayShifts.reduce((sum, shift) => sum + shift.dailyRateCents, 0);
      result.push({
        date,
        deliveries: dayDeliveries,
        deliveryTotal,
        dailyRate,
        workShifts: dayShifts,
        total: deliveryTotal + dailyRate,
      });
    }
    return result;
  }, [dailyRateCents, dailyRateDates, deliveries, endDate, startDate, workShifts]);

  const deliveryCount = days.reduce((sum, day) => sum + day.deliveries.length, 0);
  const deliveryTotal = days.reduce((sum, day) => sum + day.deliveryTotal, 0);
  const dailyRateTotal = days.reduce((sum, day) => sum + day.dailyRate, 0);
  const total = deliveryTotal + dailyRateTotal;
  const activeDays = days.filter((day) => day.total > 0).length;
  const averagePerActiveDay = activeDays ? Math.round(total / activeDays) : 0;

  const chartBars = useMemo<ChartBar[]>(() => {
    if (period === 'week') {
      return days.map((day) => ({
        key: day.date,
        label: formatDate(day.date, { weekday: 'short' }).replace('.', ''),
        total: day.total,
        description: formatDate(day.date, { day: '2-digit', month: 'long' }),
      }));
    }

    const grouped = new Map<string, DayEarnings[]>();
    for (const day of days) {
      const week = mondayOfWeek(day.date);
      const group = grouped.get(week) ?? [];
      group.push(day);
      grouped.set(week, group);
    }
    return Array.from(grouped.entries()).map(([key, group]) => {
      const firstDay = Number(group[0].date.slice(-2));
      const lastDay = Number(group[group.length - 1].date.slice(-2));
      return {
        key,
        label: `${firstDay}–${lastDay}`,
        total: group.reduce((sum, day) => sum + day.total, 0),
        description: `Dias ${firstDay} a ${lastDay}`,
      };
    });
  }, [days, period]);

  const chartMaximum = Math.max(1, ...chartBars.map((bar) => bar.total));
  const periodLabel = period === 'week'
    ? `${formatDate(startDate, { day: '2-digit', month: 'short' })} – ${formatDate(endDate, { day: '2-digit', month: 'short', year: 'numeric' })}`
    : formatDate(selectedDate, { month: 'long', year: 'numeric' });
  const [currentStart] = periodBounds(todayKey(), period);
  const isCurrentPeriod = startDate === currentStart;

  function navigatePeriod(amount: number) {
    setSelectedDate(period === 'week'
      ? addDays(selectedDate, amount * 7)
      : shiftMonth(selectedDate, amount));
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pageHeading}>
          <View style={styles.pageHeadingIcon}>
            <Banknote size={22} color={colors.greenLight} />
          </View>
          <View>
            <Text style={styles.pageTitle}>Seus ganhos</Text>
            <Text style={styles.pageSubtitle}>Acompanhe seus resultados</Text>
          </View>
        </View>

        <View style={styles.periodToggle}>
          {(['week', 'month'] as const).map((value) => {
            const active = period === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setPeriod(value)}
                style={[styles.periodButton, active && styles.periodButtonActive]}
              >
                <Text style={[styles.periodButtonText, active && styles.periodButtonTextActive]}>
                  {value === 'week' ? 'Semanal' : 'Mensal'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.periodControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={period === 'week' ? 'Semana anterior' : 'Mês anterior'}
            onPress={() => navigatePeriod(-1)}
            style={styles.arrowButton}
          >
            <ChevronLeft size={20} color={colors.greenLight} />
          </Pressable>
          <View style={styles.periodTitle}>
            <CalendarDays size={15} color={colors.greenLight} />
            <Text style={styles.periodText}>{periodLabel}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={period === 'week' ? 'Próxima semana' : 'Próximo mês'}
            onPress={() => navigatePeriod(1)}
            style={styles.arrowButton}
          >
            <ChevronRight size={20} color={colors.greenLight} />
          </Pressable>
        </View>
        {!isCurrentPeriod ? (
          <Pressable accessibilityRole="button" onPress={() => setSelectedDate(todayKey())} style={styles.todayButton}>
            <Text style={styles.todayButtonText}>Voltar para o período atual</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <Panel><Text style={styles.muted}>Carregando seus ganhos...</Text></Panel>
        ) : loadError ? (
          <Panel>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Tentar novamente</Text>
            </Pressable>
          </Panel>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total do período</Text>
              <Text style={styles.totalValue}>{formatMoney(total)}</Text>
              <View style={styles.totalDivider} />
              <View style={styles.totalBreakdown}>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Entregas</Text>
                  <Text style={styles.breakdownValue}>{formatMoney(deliveryTotal)}</Text>
                </View>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Diárias</Text>
                  <Text style={styles.breakdownValue}>{formatMoney(dailyRateTotal)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Entregas</Text>
                <Text style={styles.metricValue}>{deliveryCount}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Dias com ganhos</Text>
                <Text style={styles.metricValue}>{activeDays}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Média por dia ativo</Text>
                <Text style={[styles.metricValue, styles.metricMoney]}>{formatMoney(averagePerActiveDay)}</Text>
              </View>
            </View>

            <Panel>
              <View style={styles.chartHeader}>
                <Heading icon={period === 'week' ? CalendarDays : PackageCheck}>
                  {period === 'week' ? 'Ganhos por dia' : 'Ganhos por semana'}
                </Heading>
                <Text style={styles.chartHint}>
                  {period === 'week' ? 'Cada barra representa um dia' : 'Cada barra representa uma semana'}
                </Text>
              </View>
              <View
                accessibilityLabel={`Gráfico de ganhos ${period === 'week' ? 'semanais por dia' : 'mensais por semana'}`}
                style={styles.chart}
              >
                <View style={styles.axisLabels}>
                  <Text style={styles.axisLabel}>{compactMoney(chartMaximum)}</Text>
                  <Text style={styles.axisLabel}>{compactMoney(chartMaximum / 2)}</Text>
                  <Text style={styles.axisLabel}>R$ 0</Text>
                </View>
                <View style={styles.chartPlot}>
                  <View style={styles.gridLineTop} />
                  <View style={styles.gridLineMiddle} />
                  <View style={styles.gridLineBottom} />
                  <View style={styles.bars}>
                    {chartBars.map((bar) => {
                      const height = bar.total ? Math.max(4, (bar.total / chartMaximum) * 112) : 2;
                      return (
                        <View
                          key={bar.key}
                          accessible
                          accessibilityLabel={`${bar.description}: ${formatMoney(bar.total)}`}
                          style={styles.barColumn}
                        >
                          <View style={styles.barTrack}>
                            <View style={[styles.bar, { height }]} />
                          </View>
                          <Text numberOfLines={1} style={styles.barLabel}>{bar.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            </Panel>

            <Panel>
              <Heading icon={PackageCheck}>Detalhamento diário</Heading>
              {days.some((day) => day.total > 0) ? (
                [...days].reverse().map((day) => (
                  <View key={day.date} style={styles.dayRow}>
                    <View style={styles.dayMain}>
                      <Text style={styles.dayTitle}>
                        {formatDate(day.date, { weekday: 'short', day: '2-digit', month: 'short' })}
                      </Text>
                      <Text style={styles.daySubtitle}>
                        {day.deliveries.length} {day.deliveries.length === 1 ? 'entrega' : 'entregas'}
                        {day.dailyRate ? ` · diária ${formatMoney(day.dailyRate)}` : ''}
                        {day.workShifts.length ? ` · ${day.workShifts.length} turno(s): ${day.workShifts.map((shift) => shift.profileName).join(', ')}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.dayTotal, day.total === 0 && styles.muted]}>
                      {formatMoney(day.total)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Nenhum ganho registrado neste período.</Text>
              )}
            </Panel>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 24 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  pageHeadingIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenSoft, borderRadius: 13 },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  pageSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  periodToggle: { flexDirection: 'row', padding: 4, marginBottom: 14, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  periodButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  periodButtonActive: { backgroundColor: colors.greenSoft },
  periodButtonText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  periodButtonTextActive: { color: colors.greenLight },
  periodControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  arrowButton: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  periodTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flex: 1 },
  periodText: { color: colors.text, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  todayButton: { alignSelf: 'center', paddingVertical: 5, paddingHorizontal: 9, marginTop: -8, marginBottom: 9 },
  todayButtonText: { color: colors.greenLight, fontSize: 12, fontWeight: '700' },
  panel: { padding: 15, marginBottom: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 16 },
  totalCard: { padding: 18, marginBottom: 12, backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: '#1d5135', borderRadius: 17 },
  totalLabel: { color: '#b5c1d1', fontSize: 12, fontWeight: '600' },
  totalValue: { color: colors.greenLight, fontSize: 30, fontWeight: '800', letterSpacing: -0.7, marginTop: 5 },
  totalDivider: { height: 1, backgroundColor: '#28523c', marginVertical: 14 },
  totalBreakdown: { flexDirection: 'row', gap: 12 },
  breakdownItem: { flex: 1 },
  breakdownLabel: { color: colors.muted, fontSize: 11 },
  breakdownValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metricCard: { flex: 1, minHeight: 76, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 11, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 13 },
  metricLabel: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 5 },
  metricMoney: { color: colors.greenLight, fontSize: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  heading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chartHeader: { marginBottom: 10 },
  chartHint: { color: colors.muted, fontSize: 11, marginLeft: 26 },
  chart: { flexDirection: 'row', height: 151, marginTop: 7 },
  axisLabels: { width: 50, height: 124, justifyContent: 'space-between', paddingVertical: 0 },
  axisLabel: { color: colors.muted, fontSize: 9, textAlign: 'right', paddingRight: 7 },
  chartPlot: { flex: 1, height: 124, justifyContent: 'flex-end' },
  gridLineTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: colors.line },
  gridLineMiddle: { position: 'absolute', top: 61, left: 0, right: 0, height: 1, backgroundColor: colors.line },
  gridLineBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: colors.line },
  bars: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', gap: 2 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 },
  barTrack: { width: '68%', height: 112, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 25, backgroundColor: colors.green, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barLabel: { width: '100%', color: colors.muted, textAlign: 'center', fontSize: 9, marginTop: 6, textTransform: 'capitalize' },
  dayRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  dayMain: { flex: 1 },
  dayTitle: { color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  daySubtitle: { color: colors.muted, fontSize: 11, marginTop: 4 },
  dayTotal: { color: colors.greenLight, fontSize: 14, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingVertical: 8 },
  muted: { color: colors.muted },
  errorText: { color: colors.red, fontSize: 13, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, backgroundColor: '#202e43', borderRadius: 9 },
  retryButtonText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
