import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  HardDriveDownload,
  MapPin,
  MapPinned,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Trash,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Alert,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteDeliveriesForDate,
  deleteDelivery,
  deleteNeighborhood,
  getBackupData,
  getDailyRateDates,
  getDeliveries,
  getNeighborhoods,
  getSettings,
  getWorkShifts,
  replaceBackupData,
  saveDelivery,
  saveDailyRateDate,
  saveNeighborhood,
  saveSettings,
} from './src/database';
import {
  addDays,
  dateFromKey,
  formatDate,
  formatMoney,
  mondayOfWeek,
  parseLegacyBackup,
  parseMoneyInput,
  serializeLegacyBackup,
  todayKey,
  type AppSettings,
  type Delivery,
  type Neighborhood,
  type WorkShift,
} from './src/domain';
import { useSelectedDate } from './src/context/SelectedDateContext';
import { SlidingNumber } from './src/components/SlidingNumber';

type Screen = 'deliveries' | 'neighborhoods';

const initialSettings: AppSettings = { dailyRateCents: 0, includeDailyRate: false };

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

function Panel({ children }: { children: React.ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

function Heading({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <View style={styles.headingRow}>
      {Icon ? <Icon size={18} color={colors.greenLight} /> : null}
      <Text style={styles.heading}>{children}</Text>
    </View>
  );
}

function ActionButton({
  title,
  onPress,
  icon: Icon,
  secondary = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  icon?: LucideIcon;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        danger && styles.dangerButton,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.buttonContent}>
        {Icon ? <Icon size={17} color={secondary ? '#d7e0ec' : '#05210f'} /> : null}
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText, danger && styles.dangerButtonText]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

export default function App({ screen }: { screen: Screen }) {
  const router = useRouter();
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [dailyRateDates, setDailyRateDates] = useState<string[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState('');
  const [neighborhoodName, setNeighborhoodName] = useState('');
  const [neighborhoodPrice, setNeighborhoodPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dailyRateText, setDailyRateText] = useState('0,00');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const weekStart = mondayOfWeek(selectedDate);
  const weekEnd = addDays(weekStart, 6);

  const refresh = useCallback(async () => {
    const [neighborhoodData, deliveryData, dailyRateDateData, workShiftData, settingsData] = await Promise.all([
      getNeighborhoods(),
      getDeliveries(weekStart, weekEnd),
      getDailyRateDates(weekStart, weekEnd),
      getWorkShifts(weekStart, weekEnd),
      getSettings(),
    ]);
    neighborhoodData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    setNeighborhoods(neighborhoodData);
    setDeliveries(deliveryData);
    setDailyRateDates(dailyRateDateData);
    setWorkShifts(workShiftData);
    setSettings(settingsData);
    setDailyRateText((settingsData.dailyRateCents / 100).toFixed(2).replace('.', ','));
    setLoadError(null);
    setSelectedNeighborhoodId((current) =>
      neighborhoodData.some((item) => item.id === current) ? current : (neighborhoodData[0]?.id ?? ''),
    );
    setLoading(false);
  }, [weekStart, weekEnd]);

  useFocusEffect(useCallback(() => {
    refresh().catch((error: unknown) => {
      setLoading(false);
      setLoadError(errorText(error));
    });
  }, [refresh]));

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      Alert.alert('Não foi possível concluir', errorText(error));
    }
  }

  const selectedDeliveries = useMemo(
    () => deliveries.filter((delivery) => delivery.date === selectedDate && !delivery.shiftId),
    [deliveries, selectedDate],
  );
  const selectedDayDeliveryCount = deliveries.filter((delivery) => delivery.date === selectedDate).length;
  const deliveryTotal = selectedDeliveries.reduce((sum, delivery) => sum + delivery.priceCents, 0);
  const selectedDailyRateIncluded = dailyRateDates.includes(selectedDate);
  const selectedShiftIds = new Set(workShifts.filter((shift) => shift.date === selectedDate).map((shift) => shift.id));
  const selectedFreelancerTotal = workShifts
    .filter((shift) => shift.date === selectedDate)
    .reduce((sum, shift) => sum + shift.dailyRateCents, 0)
    + deliveries
      .filter((delivery) => delivery.shiftId && selectedShiftIds.has(delivery.shiftId))
      .reduce((sum, delivery) => sum + delivery.priceCents, 0);
  const totalWithDailyRate = deliveryTotal
    + (selectedDailyRateIncluded ? settings.dailyRateCents : 0)
    + selectedFreelancerTotal;
  const weeklyTotal = deliveries.reduce((sum, delivery) => sum + delivery.priceCents, 0)
    + settings.dailyRateCents * dailyRateDates.filter((date) => date >= weekStart && date <= weekEnd).length
    + workShifts.reduce((sum, shift) => sum + shift.dailyRateCents, 0);
  const selectedNeighborhood = neighborhoods.find((item) => item.id === selectedNeighborhoodId);

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    setDatePickerOpen(false);
    if (event.type !== 'dismissed' && date) setSelectedDate(todayKey(date));
  }

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    refresh().catch((error: unknown) => {
      setLoading(false);
      setLoadError(errorText(error));
    });
  }

  async function addDelivery() {
    if (!selectedNeighborhood) {
      Alert.alert('Cadastre um bairro', 'Cadastre um bairro antes de adicionar uma entrega.');
      return;
    }
    const now = new Date();
    await saveDelivery({
      id: makeId(),
      neighborhoodId: selectedNeighborhood.id,
      neighborhoodName: selectedNeighborhood.name,
      priceCents: selectedNeighborhood.priceCents,
      date: selectedDate,
      time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: now.toISOString(),
    });
    await refresh();
  }

  function resetNeighborhoodForm() {
    setEditingId(null);
    setNeighborhoodName('');
    setNeighborhoodPrice('');
    Keyboard.dismiss();
  }

  async function submitNeighborhood() {
    const name = neighborhoodName.trim();
    const priceCents = parseMoneyInput(neighborhoodPrice);
    if (!name || priceCents === null || priceCents <= 0) {
      Alert.alert('Dados inválidos', 'Informe o nome do bairro e um valor maior que zero.');
      return;
    }
    const duplicate = neighborhoods.find(
      (item) => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR') && item.id !== editingId,
    );
    if (duplicate) {
      Alert.alert('Bairro já cadastrado', 'Já existe um bairro com esse nome.');
      return;
    }
    await saveNeighborhood({ id: editingId ?? makeId(), name, priceCents });
    resetNeighborhoodForm();
    await refresh();
  }

  async function changeDailyRate() {
    const dailyRateCents = parseMoneyInput(dailyRateText);
    if (dailyRateCents === null) {
      Alert.alert('Valor inválido', 'Informe um valor válido para a diária.');
      setDailyRateText((settings.dailyRateCents / 100).toFixed(2).replace('.', ','));
      return;
    }
    const next = { ...settings, dailyRateCents };
    await saveSettings(next);
    setSettings(next);
    setDailyRateText((dailyRateCents / 100).toFixed(2).replace('.', ','));
  }

  async function changeDailyRateForDate(date: string, included: boolean) {
    await saveDailyRateDate(date, included);
    setDailyRateDates((current) => included
      ? current.includes(date) ? current : [...current, date]
      : current.filter((item) => item !== date));
  }

  function confirmDeleteDelivery(delivery: Delivery) {
    Alert.alert('Excluir entrega?', 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => void run(async () => {
          await deleteDelivery(delivery.id);
          await refresh();
        }),
      },
    ]);
  }

  function confirmDeleteNeighborhood(neighborhood: Neighborhood) {
    Alert.alert(
      'Excluir bairro?',
      `Excluir "${neighborhood.name}"? As entregas já registradas serão preservadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => void run(async () => {
            await deleteNeighborhood(neighborhood.id);
            if (editingId === neighborhood.id) resetNeighborhoodForm();
            await refresh();
          }),
        },
      ],
    );
  }

  function confirmClearDay() {
    const count = selectedDeliveries.length;
    if (!count) {
      Alert.alert('Sem entregas', 'Não há entregas para limpar nesta data.');
      return;
    }
    Alert.alert(
      'Limpar entregas do dia?',
      `Apagar ${count} ${count === 1 ? 'entrega' : 'entregas'} de ${formatDate(selectedDate)}? Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar dia',
          style: 'destructive',
          onPress: () => void run(async () => {
            await deleteDeliveriesForDate(selectedDate);
            await refresh();
          }),
        },
      ],
    );
  }

  async function exportBackup() {
    const available = await Sharing.isAvailableAsync();
    if (!available) throw new Error('O compartilhamento de arquivos não está disponível neste dispositivo.');
    const contents = serializeLegacyBackup(await getBackupData());
    const file = new File(Paths.cache, `backup-entregas-${todayKey()}-${Date.now()}.json`);
    await file.write(contents);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Exportar backup do Entreguei App',
      UTI: 'public.json',
    });
  }

  function importBackup() {
    void (async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/json',
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const text = await new File(result.assets[0].uri).text();
        const backup = parseLegacyBackup(text);
        Alert.alert(
          'Substituir dados?',
          'A importação substituirá bairros, entregas e configurações deste aplicativo.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Importar backup',
              onPress: () => void run(async () => {
                await replaceBackupData(backup);
                await refresh();
                Alert.alert('Backup importado', 'Os dados foram restaurados com sucesso.');
              }),
            },
          ],
        );
      } catch (error) {
        Alert.alert('Não foi possível importar', errorText(error));
      }
    })();
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Image source={require('./assets/brand-icon.png')} style={styles.brandIcon} />
        <Text style={styles.brand}>Entreguei App</Text>
        <Text style={styles.muted}>Carregando seus dados...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={styles.brand}>Não foi possível carregar os dados</Text>
        <Text style={styles.loadError}>{loadError}</Text>
        <ActionButton title="Tentar novamente" onPress={retryLoad} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'deliveries' ? (
          <>
            <View style={styles.weekSummary}>
              <Text style={styles.weekTotalLabel}>Total da semana</Text>
              <SlidingNumber value={weeklyTotal} text={formatMoney(weeklyTotal)} style={styles.weekTotal} />
            </View>
            <View style={styles.weekHeader}>
              <View style={styles.weekTitle}>
                <CalendarDays size={18} color={colors.greenLight} />
                <Text style={styles.heading}>Ganhos da semana</Text>
              </View>
              <View style={styles.dateControls}>
                <Pressable accessibilityRole="button" accessibilityLabel="Dia anterior" onPress={() => setSelectedDate(addDays(selectedDate, -1))} style={styles.dateArrow}>
                  <ChevronLeft size={20} color={colors.greenLight} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Selecionar data" onPress={() => setDatePickerOpen(true)} style={styles.dateSelect}>
                  <Text style={styles.dateText}>{formatDate(selectedDate, { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Próximo dia" onPress={() => setSelectedDate(addDays(selectedDate, 1))} style={styles.dateArrow}>
                  <ChevronRight size={20} color={colors.greenLight} />
                </Pressable>
              </View>
            </View>
            {datePickerOpen ? (
              <DateTimePicker value={dateFromKey(selectedDate)} mode="date" display="default" onChange={onDateChange} />
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
              {Array.from({ length: 7 }, (_, index) => {
                const date = addDays(weekStart, index);
                const dayTotal = deliveries
                  .filter((delivery) => delivery.date === date)
                  .reduce((sum, delivery) => sum + delivery.priceCents, 0)
                  + (dailyRateDates.includes(date) ? settings.dailyRateCents : 0)
                  + workShifts.filter((shift) => shift.date === date)
                    .reduce((sum, shift) => sum + shift.dailyRateCents, 0);
                const active = date === selectedDate;
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedDate(date)}
                    style={[styles.weekDay, active && styles.weekDayActive]}
                  >
                    <Text style={[styles.weekdayName, active && styles.activeText]}>
                      {formatDate(date, { weekday: 'short' }).replace('.', '')}
                    </Text>
                    <Text style={[styles.weekdayNumber, active && styles.activeText]}>
                      {dateFromKey(date).getDate().toString().padStart(2, '0')}
                    </Text>
                    <SlidingNumber
                      value={dayTotal}
                      text={formatMoney(dayTotal)}
                      style={[styles.weekdayTotal, active && styles.activeText]}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Panel>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Considerar diária neste dia</Text>
                <Switch
                  accessibilityLabel="Considerar diária neste dia"
                  value={selectedDailyRateIncluded}
                  onValueChange={(included) => void run(() => changeDailyRateForDate(selectedDate, included))}
                  trackColor={{ false: '#34445b', true: colors.green }}
                  thumbColor="#ffffff"
                />
              </View>
              <Text style={styles.hint}>Ative somente nos dias trabalhados. A diária será somada aos totais deste dia e da semana.</Text>
            </Panel>
            <Panel>
              <View style={styles.sectionHeader}>
                <Heading icon={Banknote}>Turnos freelancer</Heading>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.navigate('/freelancer')}
                  style={styles.smallButton}
                >
                  <Text style={styles.smallButtonText}>Gerenciar</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>
                {workShifts.filter((shift) => shift.date === selectedDate).length
                  ? `${workShifts.filter((shift) => shift.date === selectedDate).length} turno(s) registrado(s); ganhos incluídos nos totais.`
                  : 'Registre um ou mais locais de trabalho na aba Freelancer.'}
              </Text>
            </Panel>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Entregas realizadas</Text>
                <SlidingNumber
                  value={selectedDayDeliveryCount}
                  text={String(selectedDayDeliveryCount)}
                  style={styles.statValue}
                />
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total recebido</Text>
                <SlidingNumber
                  value={totalWithDailyRate}
                  text={formatMoney(totalWithDailyRate)}
                  style={[styles.statValue, styles.moneyText]}
                />
              </View>
            </View>

            <Panel>
              <Heading icon={PackagePlus}>Adicionar entrega</Heading>
              {neighborhoods.length ? (
                <>
                  <Text style={styles.label}>Bairro</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {neighborhoods.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => setSelectedNeighborhoodId(item.id)}
                        style={[styles.chip, selectedNeighborhoodId === item.id && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selectedNeighborhoodId === item.id && styles.chipTextActive]}>
                          {item.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.valueRow}>
                    <Text style={styles.muted}>Valor desta entrega</Text>
                    <Text style={styles.amount}>{formatMoney(selectedNeighborhood?.priceCents ?? 0)}</Text>
                  </View>
                  <ActionButton title="Adicionar entrega" icon={Plus} onPress={() => void run(addDelivery)} />
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>Cadastre um bairro para começar a registrar entregas.</Text>
                  <ActionButton title="Ir para Bairros" icon={MapPin} onPress={() => router.navigate('/neighborhoods')} secondary />
                </>
              )}
            </Panel>

            <Panel>
              <View style={styles.sectionHeader}>
                <Heading icon={PackageCheck}>Entregas do dia</Heading>
                <Pressable accessibilityRole="button" onPress={confirmClearDay} style={styles.dangerLink}>
                  <Trash size={15} color={colors.red} />
                  <Text style={styles.dangerLinkText}>Limpar dia</Text>
                </Pressable>
              </View>
              {selectedDeliveries.length ? selectedDeliveries.map((delivery) => (
                <View key={delivery.id} style={styles.listRow}>
                  <View style={styles.listMain}>
                    <Text style={styles.itemTitle}>{delivery.neighborhoodName}</Text>
                    <Text style={styles.muted}>{delivery.time}</Text>
                  </View>
                  <Text style={styles.amount}>{formatMoney(delivery.priceCents)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir entrega de ${delivery.neighborhoodName}`}
                    onPress={() => confirmDeleteDelivery(delivery)}
                    style={styles.deleteButton}
                  >
                    <Trash size={16} color={colors.muted} />
                  </Pressable>
                </View>
              )) : (
                <Text style={styles.emptyText}>Nenhuma entrega registrada nesta data. Adicione a primeira entrega acima.</Text>
              )}
            </Panel>
          </>
        ) : (
          <>
            <Panel>
              <Heading icon={MapPin}>{editingId ? 'Editar bairro' : 'Cadastrar bairro'}</Heading>
              <Text style={styles.label}>Nome do bairro</Text>
              <TextInput
                accessibilityLabel="Nome do bairro"
                value={neighborhoodName}
                onChangeText={setNeighborhoodName}
                placeholder="Ex.: Centro"
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxLength={60}
              />
              <Text style={styles.label}>Valor por entrega (R$)</Text>
              <TextInput
                accessibilityLabel="Valor por entrega"
                value={neighborhoodPrice}
                onChangeText={setNeighborhoodPrice}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <ActionButton
                title={editingId ? 'Salvar alterações' : 'Cadastrar bairro'}
                icon={editingId ? Save : Plus}
                onPress={() => void run(submitNeighborhood)}
              />
              {editingId ? <ActionButton title="Cancelar edição" icon={X} onPress={resetNeighborhoodForm} secondary /> : null}
            </Panel>

            <Panel>
              <Heading icon={MapPinned}>Bairros cadastrados ({neighborhoods.length})</Heading>
              {neighborhoods.length ? neighborhoods.map((neighborhood) => (
                <View key={neighborhood.id} style={styles.listRow}>
                  <View style={styles.listMain}>
                    <Text style={styles.itemTitle}>{neighborhood.name}</Text>
                    <Text style={styles.muted}>{formatMoney(neighborhood.priceCents)} por entrega</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${neighborhood.name}`}
                    onPress={() => {
                      setEditingId(neighborhood.id);
                      setNeighborhoodName(neighborhood.name);
                      setNeighborhoodPrice((neighborhood.priceCents / 100).toFixed(2).replace('.', ','));
                    }}
                    style={styles.smallButton}
                  >
                    <Pencil size={14} color="#c1ccda" />
                    <Text style={styles.smallButtonText}>Editar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir ${neighborhood.name}`}
                    onPress={() => confirmDeleteNeighborhood(neighborhood)}
                    style={styles.smallButton}
                  >
                    <Trash size={14} color="#c1ccda" />
                    <Text style={styles.smallButtonText}>Excluir</Text>
                  </Pressable>
                </View>
              )) : <Text style={styles.emptyText}>Você ainda não cadastrou nenhum bairro.</Text>}
            </Panel>

            <Panel>
              <Heading icon={Banknote}>Diária</Heading>
              <Text style={styles.label}>Valor da diária (R$)</Text>
              <TextInput
                accessibilityLabel="Valor da diária"
                value={dailyRateText}
                onChangeText={setDailyRateText}
                onBlur={() => void run(changeDailyRate)}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <Text style={styles.hint}>A diária só entra nos totais dos dias em que você ativar “Considerar diária neste dia”.</Text>
            </Panel>

            <Panel>
              <Heading icon={HardDriveDownload}>Backup e transferência</Heading>
              <Text style={styles.hint}>O arquivo JSON é compatível com a versão web. Guarde o backup em local seguro.</Text>
              <ActionButton title="Exportar backup" icon={Download} onPress={() => void run(exportBackup)} secondary />
              <ActionButton title="Importar backup" icon={Upload} onPress={importBackup} secondary />
            </Panel>
          </>
        )}
      </ScrollView>

    </View>
  );
}

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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadError: { color: colors.red, fontSize: 13, textAlign: 'center', marginTop: 12, marginBottom: 18, paddingHorizontal: 24 },
  content: { paddingHorizontal: 16, paddingTop: 58, paddingBottom: 24 },
  brandIcon: { width: 38, height: 38, borderRadius: 10 },
  brand: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  weekSummary: { marginBottom: 14 },
  weekTotalLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 3 },
  weekTotal: { color: colors.greenLight, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
  weekTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dateControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateArrow: { height: 34, width: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.panel },
  dateSelect: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dateText: { color: colors.text, fontSize: 12, fontWeight: '700', minWidth: 56, textAlign: 'center', textTransform: 'capitalize' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  heading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  weekRow: { gap: 8, paddingBottom: 18 },
  weekDay: { width: 84, alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 6, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 13 },
  weekDayActive: { backgroundColor: colors.greenSoft, borderColor: '#1d5135' },
  weekdayName: { color: colors.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  weekdayNumber: { color: colors.text, fontSize: 17, fontWeight: '800' },
  weekdayTotal: { color: colors.muted, fontSize: 10 },
  activeText: { color: colors.greenLight },
  statsRow: { flexDirection: 'row', gap: 11, marginBottom: 15 },
  statCard: { flex: 1, padding: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 16 },
  statLabel: { color: colors.muted, fontSize: 11 },
  statValue: { color: colors.text, fontSize: 23, fontWeight: '800', marginTop: 7 },
  moneyText: { color: colors.greenLight },
  panel: { padding: 16, marginBottom: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 16 },
  label: { color: '#b5c1d1', fontSize: 12, fontWeight: '600', marginBottom: 7, marginTop: 3 },
  input: { paddingHorizontal: 13, paddingVertical: 12, marginBottom: 13, backgroundColor: colors.background, borderWidth: 1, borderColor: '#34445b', borderRadius: 11, color: colors.text, fontSize: 15 },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.greenSoft, borderColor: '#1d5135' },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.greenLight },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 13 },
  muted: { color: colors.muted, fontSize: 12 },
  amount: { color: colors.greenLight, fontSize: 15, fontWeight: '700' },
  button: { minHeight: 46, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 15, marginTop: 5, backgroundColor: colors.green, borderRadius: 11 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButton: { backgroundColor: '#202e43', borderWidth: 1, borderColor: '#304159' },
  dangerButton: { backgroundColor: '#3b2028' },
  buttonText: { color: '#05210f', fontSize: 14, fontWeight: '700' },
  secondaryButtonText: { color: '#d7e0ec' },
  dangerButtonText: { color: '#fca5a5' },
  pressed: { opacity: 0.75 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dangerLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 13 },
  dangerLinkText: { color: colors.red, fontSize: 12, fontWeight: '700' },
  listRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  listMain: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  deleteButton: { width: 32, height: 32, borderWidth: 1, borderColor: '#34445b', borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1b293d' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingVertical: 8 },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: '#34445b', borderRadius: 8, backgroundColor: '#1b293d' },
  smallButtonText: { color: '#c1ccda', fontSize: 11, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  switchLabel: { flex: 1, color: '#b5c1d1', fontSize: 13 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 8, marginBottom: 3 },
});
