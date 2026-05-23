import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        try {
            await adminAuth.verifyIdToken(idToken);
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { text } = await request.json();

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const targetChatId = process.env.TELEGRAM_COUNCIL_CHAT_ID;

        if (!botToken || !targetChatId) {
            console.error('Telegram bot token or council chat ID not configured');
            return NextResponse.json({ error: 'Telegram configuration missing' }, { status: 500 });
        }

        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: text,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API error:', data);
            return NextResponse.json({ error: 'Telegram API error', details: data }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error sending Telegram message:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
