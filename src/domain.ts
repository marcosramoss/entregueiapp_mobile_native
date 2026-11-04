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
};

export type AppSettings = {
  dailyRateCents: number;
  includeDailyRate: boolean;
};

export type BackupData = {
  neighborhoods: Neighborhood[];
  deliveries: Delivery[];
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
    };
  });

  const dailyRateCents = parsed.dailyRate === undefined
    ? 0
    : moneyToCents(parsed.dailyRate, 'dailyRate', true);
  if (parsed.includeDailyRate !== undefined && typeof parsed.includeDailyRate !== 'boolean') {
    throw new Error('A configuração "includeDailyRate" é inválida.');
  }

  return {
    neighborhoods,
    deliveries,
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
    })),
    dailyRate: data.settings.dailyRateCents / 100,
    includeDailyRate: data.settings.includeDailyRate,
  }, null, 2);
}
