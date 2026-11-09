export type Neighborhood = {
  id: string;
  name: string;
  priceCents: number;
};

export type Delivery = {
  id: string;
  neighborhoodId: string | null;
  neighborhoodName: string;
  priceCents: number;
  date: string;
  time: string;
  createdAt: string;
  shiftId?: string | null;
};

export type WorkProfile = {
  id: string;
  name: string;
  dailyRateCents: number;
  neighborhoodRates: { neighborhoodId: string; priceCents: number }[];
};

export type WorkShift = {
  id: string;
  date: string;
  profileId: string;
  profileName: string;
  dailyRateCents: number;
};

export type AppSettings = {
  dailyRateCents: number;
  includeDailyRate: boolean;
};

export type BackupData = {
  neighborhoods: Neighborhood[];
  deliveries: Delivery[];
  dailyRateDates: string[];
  workProfiles: WorkProfile[];
  workShifts: WorkShift[];
  settings: AppSettings;
};

export function todayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, amount: number): string {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return todayKey(date);
}

export function mondayOfWeek(key: string): string {
  const date = dateFromKey(key);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return todayKey(date);
}

export function formatDate(key: string, options?: Intl.DateTimeFormatOptions): string {
  return dateFromKey(key).toLocaleDateString('pt-BR', options);
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '');
  if (!trimmed) return null;

  let normalized = trimmed;
  const comma = normalized.lastIndexOf(',');
  const period = normalized.lastIndexOf('.');
  if (comma >= 0 && period >= 0) {
    normalized = comma > period
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = normalized.replace(',', '.');
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Campo "${field}" ausente ou inválido.`);
  }
  return value.trim();
}

function moneyToCents(value: unknown, field: string, allowZero: boolean): number {
  if (typeof value !== 'number') throw new Error(`Valor inválido no campo "${field}".`);
  const amount = value;
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(`Valor inválido no campo "${field}".`);
  }
  return Math.round(amount * 100);
}

function storedCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Valor inválido no campo "${field}".`);
  }
  return value;
}

export function parseLegacyBackup(json: string): BackupData {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed) || !Array.isArray(parsed.neighborhoods) || !Array.isArray(parsed.deliveries)) {
    throw new Error('O arquivo não contém uma lista válida de bairros e entregas.');
  }

  const neighborhoodIds = new Set<string>();
  const neighborhoodNames = new Set<string>();
  const neighborhoods = parsed.neighborhoods.map((item, index): Neighborhood => {
    if (!isRecord(item)) throw new Error(`Bairro ${index + 1} inválido.`);
    const id = requiredText(item.id, `bairros[${index}].id`);
    const name = requiredText(item.name, `bairros[${index}].name`);
    if (neighborhoodIds.has(id)) throw new Error(`ID de bairro duplicado: ${id}.`);
    const normalizedName = name.toLocaleLowerCase('pt-BR');
    if (neighborhoodNames.has(normalizedName)) throw new Error(`Nome de bairro duplicado: ${name}.`);
    neighborhoodIds.add(id);
    neighborhoodNames.add(normalizedName);
    return {
      id,
      name,
      priceCents: moneyToCents(item.price, `bairros[${index}].price`, false),
    };
  });

  const deliveryIds = new Set<string>();
  const deliveries = parsed.deliveries.map((item, index): Delivery => {
    if (!isRecord(item)) throw new Error(`Entrega ${index + 1} inválida.`);
    const id = requiredText(item.id, `entregas[${index}].id`);
    const date = requiredText(item.date, `entregas[${index}].date`);
    const parsedDate = dateFromKey(date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number.isNaN(parsedDate.getTime())
      || todayKey(parsedDate) !== date
    ) {
      throw new Error(`Data inválida na entrega ${index + 1}.`);
    }
    if (deliveryIds.has(id)) throw new Error(`ID de entrega duplicado: ${id}.`);
    deliveryIds.add(id);
    if (item.neighborhoodId !== null && typeof item.neighborhoodId !== 'string') {
      throw new Error(`Bairro inválido na entrega ${index + 1}.`);
    }
    if (item.time !== undefined && typeof item.time !== 'string') {
      throw new Error(`Horário inválido na entrega ${index + 1}.`);
    }
    if (item.createdAt !== undefined && typeof item.createdAt !== 'string') {
      throw new Error(`Data de criação inválida na entrega ${index + 1}.`);
    }
    return {
      id,
      neighborhoodId: typeof item.neighborhoodId === 'string' ? item.neighborhoodId : null,
      neighborhoodName: requiredText(item.neighborhoodName, `entregas[${index}].neighborhoodName`),
      priceCents: moneyToCents(item.price, `entregas[${index}].price`, true),
      date,
      time: typeof item.time === 'string' ? item.time : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : `${date}T00:00:00.000Z`,
      shiftId: item.shiftId === undefined || item.shiftId === null
        ? null
        : requiredText(item.shiftId, `entregas[${index}].shiftId`),
    };
  });

  const dailyRateCents = parsed.dailyRate === undefined
    ? 0
    : moneyToCents(parsed.dailyRate, 'dailyRate', true);
  if (parsed.includeDailyRate !== undefined && typeof parsed.includeDailyRate !== 'boolean') {
    throw new Error('A configuração "includeDailyRate" é inválida.');
  }
  if (parsed.dailyRateDates !== undefined && !Array.isArray(parsed.dailyRateDates)) {
    throw new Error('A lista de dias com diária é inválida.');
  }
  const dailyRateDates = (parsed.dailyRateDates ?? []).map((value, index) => {
    const date = requiredText(value, `dailyRateDates[${index}]`);
    const parsedDate = dateFromKey(date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number.isNaN(parsedDate.getTime())
      || todayKey(parsedDate) !== date
    ) {
      throw new Error(`Data inválida na diária ${index + 1}.`);
    }
    return date;
  });
  if (new Set(dailyRateDates).size !== dailyRateDates.length) {
    throw new Error('A lista de dias com diária contém datas duplicadas.');
  }

  if (parsed.workProfiles !== undefined && !Array.isArray(parsed.workProfiles)) {
    throw new Error('A lista de perfis freelancer é inválida.');
  }
  const workProfileIds = new Set<string>();
  const workProfiles = (parsed.workProfiles === undefined ? [] : parsed.workProfiles).map((item, index): WorkProfile => {
    if (!isRecord(item) || !Array.isArray(item.neighborhoodRates)) {
      throw new Error(`Perfil freelancer ${index + 1} inválido.`);
    }
    const id = requiredText(item.id, `workProfiles[${index}].id`);
    if (workProfileIds.has(id)) throw new Error(`ID de perfil freelancer duplicado: ${id}.`);
    workProfileIds.add(id);
    const rateIds = new Set<string>();
    const neighborhoodRates = item.neighborhoodRates.map((rate, rateIndex) => {
      if (!isRecord(rate)) throw new Error(`Valor de entrega inválido no perfil ${index + 1}.`);
      const neighborhoodId = requiredText(rate.neighborhoodId, `workProfiles[${index}].neighborhoodRates[${rateIndex}].neighborhoodId`);
      if (rateIds.has(neighborhoodId)) throw new Error(`Bairro duplicado no perfil freelancer ${index + 1}.`);
      rateIds.add(neighborhoodId);
      return {
        neighborhoodId,
        priceCents: storedCents(rate.priceCents, `workProfiles[${index}].neighborhoodRates[${rateIndex}].priceCents`),
      };
    });
    return {
      id,
      name: requiredText(item.name, `workProfiles[${index}].name`),
      dailyRateCents: storedCents(item.dailyRateCents, `workProfiles[${index}].dailyRateCents`),
      neighborhoodRates,
    };
  });

  if (parsed.workShifts !== undefined && !Array.isArray(parsed.workShifts)) {
    throw new Error('A lista de turnos freelancer é inválida.');
  }
  const workShiftIds = new Set<string>();
  const workShifts = (parsed.workShifts ?? []).map((item, index): WorkShift => {
    if (!isRecord(item)) throw new Error(`Turno freelancer ${index + 1} inválido.`);
    const id = requiredText(item.id, `workShifts[${index}].id`);
    const date = requiredText(item.date, `workShifts[${index}].date`);
    const parsedDate = dateFromKey(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || todayKey(parsedDate) !== date) {
      throw new Error(`Data inválida no turno freelancer ${index + 1}.`);
    }
    if (workShiftIds.has(id)) throw new Error(`ID de turno freelancer duplicado: ${id}.`);
    workShiftIds.add(id);
    return {
      id,
      date,
      profileId: requiredText(item.profileId, `workShifts[${index}].profileId`),
      profileName: requiredText(item.profileName, `workShifts[${index}].profileName`),
      dailyRateCents: storedCents(item.dailyRateCents, `workShifts[${index}].dailyRateCents`),
    };
  });
  if (deliveries.some((delivery) => delivery.shiftId && !workShiftIds.has(delivery.shiftId))) {
    throw new Error('Há uma entrega freelancer sem o turno correspondente no backup.');
  }

  return {
    neighborhoods,
    deliveries,
    dailyRateDates,
    workProfiles,
    workShifts,
    settings: {
      dailyRateCents,
      includeDailyRate: parsed.includeDailyRate === true,
    },
  };
}

export function serializeLegacyBackup(data: BackupData): string {
  return JSON.stringify({
    neighborhoods: data.neighborhoods.map(({ id, name, priceCents }) => ({
      id,
      name,
      price: priceCents / 100,
    })),
    deliveries: data.deliveries.map((delivery) => ({
      id: delivery.id,
      neighborhoodId: delivery.neighborhoodId,
      neighborhoodName: delivery.neighborhoodName,
      price: delivery.priceCents / 100,
      date: delivery.date,
      time: delivery.time,
      createdAt: delivery.createdAt,
      shiftId: delivery.shiftId ?? null,
    })),
    dailyRate: data.settings.dailyRateCents / 100,
    includeDailyRate: data.settings.includeDailyRate,
    dailyRateDates: data.dailyRateDates,
    workProfiles: data.workProfiles,
    workShifts: data.workShifts,
  }, null, 2);
}
