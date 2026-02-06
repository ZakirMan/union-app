import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { text, chatId } = await request.json();

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const defaultChatId = process.env.TELEGRAM_COUNCIL_CHAT_ID;

        if (!botToken) {
            console.error('TELEGRAM_BOT_TOKEN not configured');
            return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
        }

        const targetChatId = chatId || defaultChatId;

        if (!targetChatId) {
            console.error('No chat ID provided');
            return NextResponse.json({ error: 'Chat ID not provided' }, { status: 400 });
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
