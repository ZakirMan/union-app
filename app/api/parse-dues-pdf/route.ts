import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    
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

    // Регулярные выражения для ФИО и сумм
    const names: string[] = [];
    const nameRegex = /([А-ЯӨҚӘҮҰҒІҢ][а-яёөқәүұғің\-]+(?:\s+[А-ЯӨҚӘҮҰҒІҢ][а-яёөқәүұғің\-]+){1,2})\s+\d{12}/g;
    let match;
    while ((match = nameRegex.exec(text)) !== null) {
      names.push(match[1].trim());
    }

    const sums: string[] = [];
    // Поддерживаем r117 или e117 (взносы), затем 'Профсоюз' и '1', и сумму
    const sumRegex = /(?:r117|e117).*?Профсоюз.*?\s+1\s+([\d,]+\.\d{2})/g;
    while ((match = sumRegex.exec(text)) !== null) {
      sums.push(match[1].replace(/,/g, ''));
    }

    // Сопоставляем
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
      results,
    });
  } catch (error: unknown) {
    console.error('Error parsing PDF:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
