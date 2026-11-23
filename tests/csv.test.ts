import { describe, expect, it } from 'vitest';
import { csvRowsToObjects, parseCsv } from '@/lib/csv';

describe('parser CSV import', () => {
  it('membaca pemisah titik-koma, kutip, dan newline di dalam kutip', () => {
    const text =
      '\uFEFFtanggal;waktu;tipe;kantong;kategori;nominal;catatan\r\n' +
      '2026-10-05;12:30;expense;GoPay;Makan;25000;"makan; siang"\r\n' +
      '2026-10-06;;income;BCA;Gaji;1000000;"gaji\nbulan ini"';
    const objects = csvRowsToObjects(parseCsv(text));
    expect(objects).toHaveLength(2);
    expect(objects[0]).toMatchObject({
      tanggal: '2026-10-05',
      tipe: 'expense',
      catatan: 'makan; siang',
      nominal: '25000',
    });
    expect(objects[1].catatan).toBe('gaji\nbulan ini');
  });

  it('mendeteksi pemisah koma', () => {
    const objects = csvRowsToObjects(parseCsv('date,type,amount\n2026-10-05,expense,25000'));
    expect(objects).toEqual([{ date: '2026-10-05', type: 'expense', amount: '25000' }]);
  });
});
