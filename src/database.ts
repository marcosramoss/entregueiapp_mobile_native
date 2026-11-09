import {
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import type {
  AppSettings,
  BackupData,
  Delivery,
  Neighborhood,
  WorkProfile,
  WorkShift,
} from './domain';

type NeighborhoodRow = {
  id: string;
  name: string;
  price_cents: number;
};

type DeliveryRow = {
  id: string;
  neighborhood_id: string | null;
  neighborhood_name: string;
  price_cents: number;
  date_key: string;
  time: string;
  created_at: string;
  shift_id: string | null;
};

type WorkShiftRow = {
  id: string;
  date_key: string;
  profile_id: string;
  profile_name: string;
  daily_rate_cents: number;
};

type WorkProfileRow = {
  id: string;
  name: string;
  daily_rate_cents: number;
};

type SettingsRow = {
  daily_rate_cents: number;
  include_daily_rate: number;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function database(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync('entreguei.db').then(async (db) => {
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((version?.user_version ?? 0) < 1) {
        await db.withTransactionAsync(async () => {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS neighborhoods (
              id TEXT PRIMARY KEY NOT NULL,
              name TEXT NOT NULL,
              price_cents INTEGER NOT NULL CHECK (price_cents > 0)
            );
            CREATE TABLE IF NOT EXISTS deliveries (
              id TEXT PRIMARY KEY NOT NULL,
              neighborhood_id TEXT,
              neighborhood_name TEXT NOT NULL,
              price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
              date_key TEXT NOT NULL,
              time TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS deliveries_date_created
              ON deliveries(date_key, created_at);
            CREATE TABLE IF NOT EXISTS settings (
              id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
              daily_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (daily_rate_cents >= 0),
              include_daily_rate INTEGER NOT NULL DEFAULT 0 CHECK (include_daily_rate IN (0, 1))
            );
            PRAGMA user_version = 1;
          `);
        });
      }
      if ((version?.user_version ?? 0) < 2) {
        await db.withTransactionAsync(async () => {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS daily_rate_dates (
              date_key TEXT PRIMARY KEY NOT NULL
            );
            PRAGMA user_version = 2;
          `);
        });
      }
      if ((version?.user_version ?? 0) < 3) {
        await db.withTransactionAsync(async () => {
          await db.execAsync(`
            ALTER TABLE deliveries ADD COLUMN shift_id TEXT;
            CREATE INDEX IF NOT EXISTS deliveries_shift ON deliveries(shift_id);
            CREATE TABLE IF NOT EXISTS work_profiles (
              id TEXT PRIMARY KEY NOT NULL,
              name TEXT NOT NULL,
              daily_rate_cents INTEGER NOT NULL CHECK (daily_rate_cents >= 0)
            );
            CREATE TABLE IF NOT EXISTS work_profile_neighborhood_rates (
              profile_id TEXT NOT NULL,
              neighborhood_id TEXT NOT NULL,
              price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
              PRIMARY KEY (profile_id, neighborhood_id)
            );
            CREATE TABLE IF NOT EXISTS work_shifts (
              id TEXT PRIMARY KEY NOT NULL,
              date_key TEXT NOT NULL,
              profile_id TEXT NOT NULL,
              profile_name TEXT NOT NULL,
              daily_rate_cents INTEGER NOT NULL CHECK (daily_rate_cents >= 0)
            );
            CREATE INDEX IF NOT EXISTS work_shifts_date ON work_shifts(date_key);
            PRAGMA user_version = 3;
          `);
        });
      }
      await db.runAsync(
        'INSERT OR IGNORE INTO settings (id, daily_rate_cents, include_daily_rate) VALUES (1, 0, 0)',
      );
      return db;
    }).catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function mapNeighborhood(row: NeighborhoodRow): Neighborhood {
  return { id: row.id, name: row.name, priceCents: row.price_cents };
}

function mapDelivery(row: DeliveryRow): Delivery {
  return {
    id: row.id,
    neighborhoodId: row.neighborhood_id,
    neighborhoodName: row.neighborhood_name,
    priceCents: row.price_cents,
    date: row.date_key,
    time: row.time,
    createdAt: row.created_at,
    shiftId: row.shift_id,
  };
}

export async function getNeighborhoods(): Promise<Neighborhood[]> {
  const db = await database();
  const rows = await db.getAllAsync<NeighborhoodRow>('SELECT * FROM neighborhoods');
  return rows.map(mapNeighborhood);
}

export async function getDeliveries(startDate: string, endDate: string): Promise<Delivery[]> {
  const db = await database();
  const rows = await db.getAllAsync<DeliveryRow>(
    'SELECT * FROM deliveries WHERE date_key BETWEEN ? AND ? ORDER BY created_at DESC',
    startDate,
    endDate,
  );
  return rows.map(mapDelivery);
}

export async function getDailyRateDates(startDate: string, endDate: string): Promise<string[]> {
  const db = await database();
  const rows = await db.getAllAsync<{ date_key: string }>(
    'SELECT date_key FROM daily_rate_dates WHERE date_key BETWEEN ? AND ? ORDER BY date_key',
    startDate,
    endDate,
  );
  return rows.map((row) => row.date_key);
}

export async function getWorkProfiles(): Promise<WorkProfile[]> {
  const db = await database();
  const [profiles, rates] = await Promise.all([
    db.getAllAsync<WorkProfileRow>('SELECT * FROM work_profiles ORDER BY name COLLATE NOCASE'),
    db.getAllAsync<{ profile_id: string; neighborhood_id: string; price_cents: number }>(
      'SELECT * FROM work_profile_neighborhood_rates',
    ),
  ]);
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    dailyRateCents: profile.daily_rate_cents,
    neighborhoodRates: rates
      .filter((rate) => rate.profile_id === profile.id)
      .map((rate) => ({ neighborhoodId: rate.neighborhood_id, priceCents: rate.price_cents })),
  }));
}

export async function getWorkShifts(startDate: string, endDate: string): Promise<WorkShift[]> {
  const db = await database();
  const rows = await db.getAllAsync<WorkShiftRow>(
    'SELECT * FROM work_shifts WHERE date_key BETWEEN ? AND ? ORDER BY id',
    startDate,
    endDate,
  );
  return rows.map((row) => ({
    id: row.id,
    date: row.date_key,
    profileId: row.profile_id,
    profileName: row.profile_name,
    dailyRateCents: row.daily_rate_cents,
  }));
}

export async function getSettings(): Promise<AppSettings> {
  const db = await database();
  const row = await db.getFirstAsync<SettingsRow>('SELECT * FROM settings WHERE id = 1');
  if (!row) throw new Error('As configurações locais não foram encontradas.');
  return {
    dailyRateCents: row.daily_rate_cents,
    includeDailyRate: row.include_daily_rate === 1,
  };
}

export async function getBackupData(): Promise<BackupData> {
  const [neighborhoods, deliveries, dailyRateDates, workProfiles, workShifts, settings] = await Promise.all([
    getNeighborhoods(),
    getDeliveries('0000-01-01', '9999-12-31'),
    getDailyRateDates('0000-01-01', '9999-12-31'),
    getWorkProfiles(),
    getWorkShifts('0000-01-01', '9999-12-31'),
    getSettings(),
  ]);
  return { neighborhoods, deliveries, dailyRateDates, workProfiles, workShifts, settings };
}

export async function saveNeighborhood(neighborhood: Neighborhood): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO neighborhoods (id, name, price_cents) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, price_cents = excluded.price_cents`,
    neighborhood.id,
    neighborhood.name,
    neighborhood.priceCents,
  );
}

export async function deleteNeighborhood(id: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM neighborhoods WHERE id = ?', id);
}

export async function saveDelivery(delivery: Delivery): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO deliveries
      (id, neighborhood_id, neighborhood_name, price_cents, date_key, time, created_at, shift_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    delivery.id,
    delivery.neighborhoodId,
    delivery.neighborhoodName,
    delivery.priceCents,
    delivery.date,
    delivery.time,
    delivery.createdAt,
    delivery.shiftId ?? null,
  );
}

export async function saveWorkProfile(profile: WorkProfile): Promise<void> {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO work_profiles (id, name, daily_rate_cents) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, daily_rate_cents = excluded.daily_rate_cents`,
      profile.id,
      profile.name,
      profile.dailyRateCents,
    );
    await db.runAsync('DELETE FROM work_profile_neighborhood_rates WHERE profile_id = ?', profile.id);
    for (const rate of profile.neighborhoodRates) {
      await db.runAsync(
        'INSERT INTO work_profile_neighborhood_rates (profile_id, neighborhood_id, price_cents) VALUES (?, ?, ?)',
        profile.id,
        rate.neighborhoodId,
        rate.priceCents,
      );
    }
  });
}

export async function deleteWorkProfile(id: string): Promise<void> {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM work_profile_neighborhood_rates WHERE profile_id = ?', id);
    await db.runAsync('DELETE FROM work_profiles WHERE id = ?', id);
  });
}

export async function saveWorkShift(shift: WorkShift): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO work_shifts (id, date_key, profile_id, profile_name, daily_rate_cents)
     VALUES (?, ?, ?, ?, ?)`,
    shift.id,
    shift.date,
    shift.profileId,
    shift.profileName,
    shift.dailyRateCents,
  );
}

export async function saveDailyRateDate(date: string, included: boolean): Promise<void> {
  const db = await database();
  if (included) {
    await db.runAsync('INSERT OR IGNORE INTO daily_rate_dates (date_key) VALUES (?)', date);
  } else {
    await db.runAsync('DELETE FROM daily_rate_dates WHERE date_key = ?', date);
  }
}

export async function deleteDelivery(id: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM deliveries WHERE id = ?', id);
}

export async function deleteDeliveriesForDate(date: string): Promise<number> {
  const db = await database();
  const result = await db.runAsync('DELETE FROM deliveries WHERE date_key = ?', date);
  return result.changes;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await database();
  await db.runAsync(
    'UPDATE settings SET daily_rate_cents = ?, include_daily_rate = ? WHERE id = 1',
    settings.dailyRateCents,
    settings.includeDailyRate ? 1 : 0,
  );
}

export async function replaceBackupData(data: BackupData): Promise<void> {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM deliveries');
    await db.runAsync('DELETE FROM daily_rate_dates');
    await db.runAsync('DELETE FROM work_shifts');
    await db.runAsync('DELETE FROM work_profile_neighborhood_rates');
    await db.runAsync('DELETE FROM work_profiles');
    await db.runAsync('DELETE FROM neighborhoods');
    for (const neighborhood of data.neighborhoods) {
      await db.runAsync(
        'INSERT INTO neighborhoods (id, name, price_cents) VALUES (?, ?, ?)',
        neighborhood.id,
        neighborhood.name,
        neighborhood.priceCents,
      );
    }
    for (const delivery of data.deliveries) {
      await db.runAsync(
        `INSERT INTO deliveries
          (id, neighborhood_id, neighborhood_name, price_cents, date_key, time, created_at, shift_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        delivery.id,
        delivery.neighborhoodId,
        delivery.neighborhoodName,
        delivery.priceCents,
        delivery.date,
        delivery.time,
        delivery.createdAt,
        delivery.shiftId ?? null,
      );
    }
    for (const date of data.dailyRateDates) {
      await db.runAsync('INSERT INTO daily_rate_dates (date_key) VALUES (?)', date);
    }
    for (const profile of data.workProfiles) {
      await db.runAsync(
        'INSERT INTO work_profiles (id, name, daily_rate_cents) VALUES (?, ?, ?)',
        profile.id,
        profile.name,
        profile.dailyRateCents,
      );
      for (const rate of profile.neighborhoodRates) {
        await db.runAsync(
          'INSERT INTO work_profile_neighborhood_rates (profile_id, neighborhood_id, price_cents) VALUES (?, ?, ?)',
          profile.id,
          rate.neighborhoodId,
          rate.priceCents,
        );
      }
    }
    for (const shift of data.workShifts) {
      await db.runAsync(
        'INSERT INTO work_shifts (id, date_key, profile_id, profile_name, daily_rate_cents) VALUES (?, ?, ?, ?, ?)',
        shift.id,
        shift.date,
        shift.profileId,
        shift.profileName,
        shift.dailyRateCents,
      );
    }
    await db.runAsync(
      'UPDATE settings SET daily_rate_cents = ?, include_daily_rate = ? WHERE id = 1',
      data.settings.dailyRateCents,
      data.settings.includeDailyRate ? 1 : 0,
    );
  });
}
