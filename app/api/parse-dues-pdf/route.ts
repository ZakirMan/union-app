import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Парсим PDF
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    // Регулярные выражения для ФИО и сумм (более гибкие)
    const names: string[] = [];
    // Ищем ФИО (2 или 3 слова с заглавной буквы, разрешаем дефисы и любой регистр внутри слова)
    const nameRegex = /([А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+(?:\s+[А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+){1,2})/g;
    let match;
    while ((match = nameRegex.exec(text)) !== null) {
      const name = match[1].trim();
      // Исключаем случайные совпадения
      if (!name.toLowerCase().includes('профсоюз') && !name.toLowerCase().includes('итого')) {
        names.push(name);
      }
    }

    const sums: string[] = [];
    // Ищем сумму после слова "Профсоюз" (в радиусе 50 символов), учитывая пробелы в тысячах (4 598.37)
    const sumRegex = /Профсоюз[\s\S]{1,50}?([\d\s,]+[\.,]\d{2})/gi;
    while ((match = sumRegex.exec(text)) !== null) {
      // Сумма может приклеиться к количеству, например "1 4,598.37". Берем только последнюю часть
      const raw = match[1].trim();
      const parts = raw.split(/\s+/);
      const amountStr = parts[parts.length - 1]; // "4,598.37"
      // Очищаем от запятых, приводим к формату 1234.56
      sums.push(amountStr.replace(/,/g, '').replace(',', '.'));
    }

    // Возвращаем сырой текст, если ничего не нашли (для отладки)
    const rawTextPreview = text.substring(0, 1500);

    const results = [];
    const count = Math.min(names.length, sums.length);
    for (let i = 0; i < count; i++) {
      results.push({ name: names[i], amount: sums[i] });
    }

    return NextResponse.json({
      success: true,
      totalParsed: count,
      namesCount: names.length,
      sumsCount: sums.length,
      rawTextPreview,
      results,
    });
  } catch (error: unknown) {
    console.error('Error parsing PDF:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
