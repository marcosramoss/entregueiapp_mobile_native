import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { Banknote, CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash, X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteDelivery,
  deleteWorkProfile,
  getDeliveries,
  getNeighborhoods,
  getWorkProfiles,
  getWorkShifts,
  saveDelivery,
  saveWorkProfile,
  saveWorkShift,
} from '../database';
import { addDays, formatDate, formatMoney, parseMoneyInput, todayKey } from '../domain';
import type { Delivery, Neighborhood, WorkProfile, WorkShift } from '../domain';
import { useSelectedDate } from '../context/SelectedDateContext';

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

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

function Panel({ children }: { children: React.ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

function ActionButton({
  title,
  onPress,
  secondary = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton, danger && styles.dangerButton]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText, danger && styles.dangerButtonText]}>
        {title}
      </Text>
    </Pressable>
  );
}

export default function FreelancerScreen() {
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [profiles, setProfiles] = useState<WorkProfile[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profileDailyRate, setProfileDailyRate] = useState('0,00');
  const [profileRates, setProfileRates] = useState<Record<string, string>>({});
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [shiftDailyRate, setShiftDailyRate] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState('');
  const [deliveryRate, setDeliveryRate] = useState('');
  const [loading, setLoading] = useState(true);
  const initializedProfiles = useRef(false);

  const refresh = useCallback(async () => {
    const [profileData, neighborhoodData, shiftData, deliveryData] = await Promise.all([
      getWorkProfiles(),
      getNeighborhoods(),
      getWorkShifts(selectedDate, selectedDate),
      getDeliveries(selectedDate, selectedDate),
    ]);
    setProfiles(profileData);
    setNeighborhoods(neighborhoodData.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    setShifts(shiftData);
    setDeliveries(deliveryData.filter((delivery) => delivery.shiftId));
    setSelectedProfileId((current) => profileData.some((profile) => profile.id === current)
      ? current
      : (profileData[0]?.id ?? ''));
    if (!initializedProfiles.current) {
      initializedProfiles.current = true;
      if (profileData[0]) {
        setShiftDailyRate((profileData[0].dailyRateCents / 100).toFixed(2).replace('.', ','));
      }
    }
    setSelectedShiftId((current) => shiftData.some((shift) => shift.id === current)
      ? current
      : (shiftData[0]?.id ?? ''));
    setLoading(false);
  }, [selectedDate]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void refresh().catch((error: unknown) => {
      if (active) {
        setLoading(false);
        Alert.alert('Não foi possível carregar', errorText(error));
      }
    });
    return () => {
      active = false;
    };
  }, [refresh]));

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId);
  const selectedShiftProfile = selectedShift
    ? profiles.find((profile) => profile.id === selectedShift.profileId)
    : undefined;
  const selectedNeighborhood = neighborhoods.find((item) => item.id === selectedNeighborhoodId);
  function resetProfileForm() {
    setEditingProfileId(null);
    setProfileName('');
    setProfileDailyRate('0,00');
    setProfileRates({});
  }

  function editProfile(profile: WorkProfile) {
    setEditingProfileId(profile.id);
    setProfileName(profile.name);
    setProfileDailyRate((profile.dailyRateCents / 100).toFixed(2).replace('.', ','));
    setProfileRates(Object.fromEntries(profile.neighborhoodRates.map((rate) => [
      rate.neighborhoodId,
      (rate.priceCents / 100).toFixed(2).replace('.', ','),
    ])));
  }

  async function submitProfile() {
    const name = profileName.trim();
    const dailyRateCents = parseMoneyInput(profileDailyRate);
    if (!name || dailyRateCents === null) {
      Alert.alert('Dados inválidos', 'Informe o nome do local e um valor válido para a diária.');
      return;
    }
    if (profiles.some((profile) => profile.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')
      && profile.id !== editingProfileId)) {
      Alert.alert('Perfil já cadastrado', 'Já existe um local com esse nome.');
      return;
    }
    const neighborhoodRates: WorkProfile['neighborhoodRates'] = [];
    for (const neighborhood of neighborhoods) {
      const raw = profileRates[neighborhood.id]
        ?? (neighborhood.priceCents / 100).toFixed(2).replace('.', ',');
      const priceCents = parseMoneyInput(raw);
      if (priceCents === null) {
        Alert.alert('Valor inválido', `Confira o valor de entrega para ${neighborhood.name}.`);
        return;
      }
      neighborhoodRates.push({ neighborhoodId: neighborhood.id, priceCents });
    }
    const profile: WorkProfile = {
      id: editingProfileId ?? makeId(),
      name,
      dailyRateCents,
      neighborhoodRates,
    };
    await saveWorkProfile(profile);
    await refresh();
    setSelectedProfileId(profile.id);
    resetProfileForm();
    setShiftDailyRate((profile.dailyRateCents / 100).toFixed(2).replace('.', ','));
  }

  function confirmDeleteProfile(profile: WorkProfile) {
    Alert.alert(
      'Excluir perfil?',
      'Os turnos e valores já registrados serão mantidos no histórico.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => void deleteWorkProfile(profile.id).then(async () => {
            if (editingProfileId === profile.id) resetProfileForm();
            await refresh();
          }).catch((error: unknown) => Alert.alert('Não foi possível excluir', errorText(error))),
        },
      ],
    );
  }

  async function createShift() {
    if (!selectedProfile) {
      Alert.alert('Cadastre um local', 'Crie um perfil freelancer antes de iniciar um turno.');
      return;
    }
    const dailyRateCents = parseMoneyInput(shiftDailyRate);
    if (dailyRateCents === null) {
      Alert.alert('Valor inválido', 'Informe uma diária válida para este turno.');
      return;
    }
    const shift: WorkShift = {
      id: makeId(),
      date: selectedDate,
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      dailyRateCents,
    };
    await saveWorkShift(shift);
    await refresh();
    setSelectedShiftId(shift.id);
  }

  function selectProfile(profile: WorkProfile) {
    setSelectedProfileId(profile.id);
    setShiftDailyRate((profile.dailyRateCents / 100).toFixed(2).replace('.', ','));
    setSelectedNeighborhoodId('');
    setDeliveryRate('');
  }

  function selectNeighborhood(neighborhood: Neighborhood) {
    setSelectedNeighborhoodId(neighborhood.id);
    const rate = selectedShiftProfile?.neighborhoodRates.find((item) => item.neighborhoodId === neighborhood.id);
    setDeliveryRate(((rate?.priceCents ?? neighborhood.priceCents) / 100).toFixed(2).replace('.', ','));
  }

  async function addDelivery() {
    if (!selectedShift || !selectedProfile || !selectedNeighborhood) {
      Alert.alert('Selecione um turno e um bairro', 'Escolha o turno e o bairro desta entrega.');
      return;
    }
    const priceCents = parseMoneyInput(deliveryRate);
    if (priceCents === null) {
      Alert.alert('Valor inválido', 'Informe um valor válido para a entrega.');
      return;
    }
    const now = new Date();
    await saveDelivery({
      id: makeId(),
      neighborhoodId: selectedNeighborhood.id,
      neighborhoodName: selectedNeighborhood.name,
      priceCents,
      date: selectedDate,
      time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: now.toISOString(),
      shiftId: selectedShift.id,
    });
    await refresh();
    setDeliveryRate('');
  }

  async function removeDelivery(delivery: Delivery) {
    try {
      await deleteDelivery(delivery.id);
      await refresh();
    } catch (error) {
      Alert.alert('Não foi possível excluir', errorText(error));
    }
  }

  const shiftTotal = (shift: WorkShift) => shift.dailyRateCents
    + deliveries.filter((delivery) => delivery.shiftId === shift.id)
      .reduce((sum, delivery) => sum + delivery.priceCents, 0);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.pageHeading}>
          <View style={styles.pageHeadingIcon}><Banknote size={22} color={colors.greenLight} /></View>
          <View>
            <Text style={styles.pageTitle}>Freelancer</Text>
            <Text style={styles.pageSubtitle}>Cadastre locais e registre turnos</Text>
          </View>
        </View>

        <Panel>
          <View style={styles.dateHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Dia anterior" onPress={() => setSelectedDate(addDays(selectedDate, -1))} style={styles.arrow}>
              <ChevronLeft size={20} color={colors.greenLight} />
            </Pressable>
            <View style={styles.dateTitle}>
              <CalendarDays size={16} color={colors.greenLight} />
              <Text style={styles.dateText}>{formatDate(selectedDate, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Próximo dia" onPress={() => setSelectedDate(addDays(selectedDate, 1))} style={styles.arrow}>
              <ChevronRight size={20} color={colors.greenLight} />
            </Pressable>
          </View>
          {selectedDate !== todayKey() ? (
            <Pressable accessibilityRole="button" onPress={() => setSelectedDate(todayKey())} style={styles.todayButton}>
              <Text style={styles.todayText}>Ir para hoje</Text>
            </Pressable>
          ) : null}
        </Panel>

        <Panel>
          <View style={styles.sectionHeading}>
            <Text style={styles.heading}>Locais de trabalho</Text>
            <Pressable accessibilityRole="button" onPress={resetProfileForm} style={styles.iconButton}>
              <Plus size={17} color={colors.greenLight} />
            </Pressable>
          </View>
          {profiles.length ? profiles.map((profile) => {
            const active = selectedProfileId === profile.id;
            return (
              <View key={profile.id} style={[styles.profileRow, active && styles.profileRowActive]}>
                <Pressable style={styles.profileSelect} onPress={() => selectProfile(profile)}>
                  <Text style={[styles.profileName, active && styles.activeText]}>{profile.name}</Text>
                  <Text style={styles.muted}>
                    Diária {formatMoney(profile.dailyRateCents)} · {profile.neighborhoodRates.length} valores de entrega
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${profile.name}`} onPress={() => editProfile(profile)} style={styles.iconButton}>
                  <Pencil size={15} color={colors.muted} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Excluir ${profile.name}`} onPress={() => confirmDeleteProfile(profile)} style={styles.iconButton}>
                  <Trash size={15} color={colors.red} />
                </Pressable>
              </View>
            );
          }) : <Text style={styles.emptyText}>Cadastre cada restaurante ou local que paga por diária e entrega.</Text>}

          <View style={styles.formDivider} />
          <Text style={styles.label}>{editingProfileId ? 'Editar local' : 'Novo local'}</Text>
          <TextInput
            accessibilityLabel="Nome do local de trabalho"
            value={profileName}
            onChangeText={setProfileName}
            placeholder="Ex.: Pizzaria do Centro"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.label}>Diária padrão</Text>
          <TextInput
            accessibilityLabel="Diária padrão do local"
            value={profileDailyRate}
            onChangeText={setProfileDailyRate}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {neighborhoods.length ? (
            <>
              <Text style={styles.label}>Valor padrão por entrega e bairro</Text>
              {neighborhoods.map((neighborhood) => (
                <View key={neighborhood.id} style={styles.rateRow}>
                  <Text style={styles.rateName}>{neighborhood.name}</Text>
                  <TextInput
                    accessibilityLabel={`Valor por entrega em ${neighborhood.name}`}
                    value={profileRates[neighborhood.id]
                      ?? (neighborhood.priceCents / 100).toFixed(2).replace('.', ',')}
                    onChangeText={(value) => setProfileRates((current) => ({ ...current, [neighborhood.id]: value }))}
                    keyboardType="decimal-pad"
                    style={styles.rateInput}
                  />
                </View>
              ))}
            </>
          ) : <Text style={styles.hint}>Cadastre bairros na aba Bairros para definir valores padrão por entrega.</Text>}
          <View style={styles.buttonRow}>
            <ActionButton title={editingProfileId ? 'Salvar alterações' : 'Salvar local'} onPress={() => void submitProfile().catch((error: unknown) => Alert.alert('Não foi possível salvar', errorText(error)))} />
            {editingProfileId ? <ActionButton title="Cancelar" onPress={resetProfileForm} secondary /> : null}
          </View>
        </Panel>

        <Panel>
          <Text style={styles.heading}>Iniciar turno</Text>
          {profiles.length ? (
            <>
              <Text style={styles.label}>Perfil do local</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {profiles.map((profile) => (
                  <Pressable key={profile.id} onPress={() => selectProfile(profile)} style={[styles.chip, selectedProfileId === profile.id && styles.chipActive]}>
                    <Text style={[styles.chipText, selectedProfileId === profile.id && styles.chipTextActive]}>{profile.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>Diária deste turno (pode ser diferente do padrão)</Text>
              <TextInput
                accessibilityLabel="Diária deste turno"
                value={shiftDailyRate}
                onChangeText={setShiftDailyRate}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <ActionButton title="Adicionar turno neste dia" onPress={() => void createShift().catch((error: unknown) => Alert.alert('Não foi possível criar o turno', errorText(error)))} />
            </>
          ) : (
            <Text style={styles.emptyText}>Salve um perfil de trabalho para adicionar um turno.</Text>
          )}
        </Panel>

        <Panel>
          <Text style={styles.heading}>Turnos do dia</Text>
          {loading ? <Text style={styles.emptyText}>Carregando...</Text> : shifts.length ? shifts.map((shift) => {
            const active = shift.id === selectedShiftId;
            const shiftDeliveries = deliveries.filter((delivery) => delivery.shiftId === shift.id);
            return (
              <View key={shift.id} style={[styles.shiftCard, active && styles.shiftCardActive]}>
                <Pressable onPress={() => setSelectedShiftId(shift.id)} style={styles.shiftHeader}>
                  <View style={styles.shiftMain}>
                    <Text style={styles.profileName}>{shift.profileName}</Text>
                    <Text style={styles.muted}>{shiftDeliveries.length} {shiftDeliveries.length === 1 ? 'entrega' : 'entregas'} · diária {formatMoney(shift.dailyRateCents)}</Text>
                  </View>
                  <Text style={styles.shiftTotal}>{formatMoney(shiftTotal(shift))}</Text>
                </Pressable>
                {shiftDeliveries.map((delivery) => (
                  <View key={delivery.id} style={styles.deliveryRow}>
                    <Text style={styles.deliveryName}>{delivery.neighborhoodName} · {delivery.time}</Text>
                    <Text style={styles.deliveryAmount}>{formatMoney(delivery.priceCents)}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Excluir entrega de ${delivery.neighborhoodName}`} onPress={() => void removeDelivery(delivery)} style={styles.iconButton}>
                      <X size={15} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          }) : <Text style={styles.emptyText}>Nenhum turno registrado nesta data. Você pode adicionar vários locais no mesmo dia.</Text>}
        </Panel>

        {selectedShift ? (
          <Panel>
            <Text style={styles.heading}>Adicionar entrega · {selectedShift.profileName}</Text>
            {neighborhoods.length ? (
              <>
                <Text style={styles.label}>Bairro</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {neighborhoods.map((neighborhood) => (
                    <Pressable key={neighborhood.id} onPress={() => selectNeighborhood(neighborhood)} style={[styles.chip, selectedNeighborhoodId === neighborhood.id && styles.chipActive]}>
                      <Text style={[styles.chipText, selectedNeighborhoodId === neighborhood.id && styles.chipTextActive]}>{neighborhood.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.label}>Valor desta entrega (editável)</Text>
                <TextInput
                  accessibilityLabel="Valor desta entrega freelancer"
                  value={deliveryRate}
                  onChangeText={setDeliveryRate}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <ActionButton title="Registrar entrega" onPress={() => void addDelivery().catch((error: unknown) => Alert.alert('Não foi possível registrar', errorText(error)))} />
              </>
            ) : <Text style={styles.emptyText}>Cadastre bairros para registrar entregas neste turno.</Text>}
          </Panel>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 24 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 17 },
  pageHeadingIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenSoft, borderRadius: 13 },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  pageSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  panel: { padding: 15, marginBottom: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 16 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  dateTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dateText: { color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  arrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.background },
  todayButton: { alignSelf: 'center', paddingTop: 9 },
  todayText: { color: colors.greenLight, fontSize: 12, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  label: { color: '#b5c1d1', fontSize: 12, fontWeight: '600', marginBottom: 7, marginTop: 10 },
  input: { paddingHorizontal: 13, paddingVertical: 11, marginBottom: 7, backgroundColor: colors.background, borderWidth: 1, borderColor: '#34445b', borderRadius: 10, color: colors.text, fontSize: 15 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  profileRowActive: { backgroundColor: colors.greenSoft, borderRadius: 10 },
  profileSelect: { flex: 1, paddingVertical: 3 },
  profileName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 11, marginTop: 4 },
  activeText: { color: colors.greenLight },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.background },
  formDivider: { height: 1, backgroundColor: colors.line, marginTop: 12, marginBottom: 4 },
  rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.line },
  rateName: { flex: 1, color: colors.text, fontSize: 13 },
  rateInput: { minWidth: 95, paddingHorizontal: 10, paddingVertical: 8, color: colors.text, textAlign: 'right', backgroundColor: colors.background, borderWidth: 1, borderColor: '#34445b', borderRadius: 9 },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.greenSoft, borderColor: '#1d5135' },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.greenLight },
  button: { minHeight: 43, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, marginTop: 7, backgroundColor: colors.green, borderRadius: 10 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  secondaryButton: { backgroundColor: '#202e43', borderWidth: 1, borderColor: '#304159' },
  dangerButton: { backgroundColor: '#3b2028' },
  buttonText: { color: '#05210f', fontSize: 13, fontWeight: '700' },
  secondaryButtonText: { color: '#d7e0ec' },
  dangerButtonText: { color: '#fca5a5' },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 19, paddingVertical: 7 },
  shiftCard: { marginTop: 9, padding: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  shiftCardActive: { borderColor: '#1d5135' },
  shiftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftMain: { flex: 1 },
  shiftTotal: { color: colors.greenLight, fontSize: 14, fontWeight: '800' },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 9, marginTop: 7, borderTopWidth: 1, borderTopColor: colors.line },
  deliveryName: { flex: 1, color: colors.muted, fontSize: 11 },
  deliveryAmount: { color: colors.text, fontSize: 12, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
});
