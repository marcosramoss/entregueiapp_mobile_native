import {
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import type { AppSettings, BackupData, Delivery, Neighborhood } from './domain';

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
  const [neighborhoods, deliveries, settings] = await Promise.all([
    getNeighborhoods(),
    getDeliveries('0000-01-01', '9999-12-31'),
    getSettings(),
  ]);
  return { neighborhoods, deliveries, settings };
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
      (id, neighborhood_id, neighborhood_name, price_cents, date_key, time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    delivery.id,
    delivery.neighborhoodId,
    delivery.neighborhoodName,
    delivery.priceCents,
    delivery.date,
    delivery.time,
    delivery.createdAt,
  );
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
          (id, neighborhood_id, neighborhood_name, price_cents, date_key, time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        delivery.id,
        delivery.neighborhoodId,
        delivery.neighborhoodName,
        delivery.priceCents,
        delivery.date,
        delivery.time,
        delivery.createdAt,
      );
    }
    await db.runAsync(
      'UPDATE settings SET daily_rate_cents = ?, include_daily_rate = ? WHERE id = 1',
      data.settings.dailyRateCents,
      data.settings.includeDailyRate ? 1 : 0,
    );
  });
}
