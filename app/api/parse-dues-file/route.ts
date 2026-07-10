import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Файл не найден' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Читаем Excel
    const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Получаем данные как 2D массив (raw: true сохраняет числа как числа)
    const rows = xlsx.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: true });

    // 1. Ищем колонку с профсоюзными взносами
    let duesCol = -1;
    for (let i = 0; i < Math.min(100, rows.length); i++) {
      const row = rows[i];
      if (!row) continue;
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').toLowerCase();
        if (cell.includes('профсоюз')) {
          duesCol = j;
          break;
        }
      }
      if (duesCol !== -1) break;
    }

    // 2. Ищем колонку с ФИО (где больше всего совпадений с шаблоном ФИО)
    let nameCol = -1;
    let maxNames = 0;
    const nameRegex = /^([А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+(?:\s+[А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+){1,2})$/;

    for (let j = 0; j < 50; j++) {
      let nameCount = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && row[j] && typeof row[j] === 'string') {
          const val = row[j].trim();
          if (nameRegex.test(val) && !val.toLowerCase().includes('профсоюз') && !val.toLowerCase().includes('итого')) {
            nameCount++;
          }
        }
      }
      if (nameCount > maxNames) {
        maxNames = nameCount;
        nameCol = j;
      }
    }

    const results: {name: string, amount: string}[] = [];

    // 3. Собираем данные
    if (nameCol !== -1 && duesCol !== -1) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;

        const nameVal = String(row[nameCol] || '').trim();
        if (nameRegex.test(nameVal) && !nameVal.toLowerCase().includes('профсоюз') && !nameVal.toLowerCase().includes('итого')) {
          const sumVal = row[duesCol];
          if (sumVal !== undefined && sumVal !== null && sumVal !== '') {
            if (typeof sumVal === 'number') {
              results.push({ name: nameVal, amount: sumVal.toFixed(2) });
            } else {
              const cleanSum = String(sumVal).replace(/\s+/g, '').replace(',', '.');
              const num = parseFloat(cleanSum);
              if (!isNaN(num)) {
                results.push({ name: nameVal, amount: num.toFixed(2) });
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalParsed: results.length,
      namesCount: maxNames,
      sumsCount: results.length,
      rawTextPreview: `Колонка ФИО: ${nameCol}, Колонка взносов: ${duesCol}`,
      results,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Ошибка парсинга' },
      { status: 500 }
    );
  }
}
